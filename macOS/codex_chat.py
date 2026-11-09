"""One read-only ephemeral App Server turn. JSON in on stdin, events out."""
import json
import os
from pathlib import Path
import queue
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from materials import with_sources


def output(kind, value):
    print(json.dumps({"kind": kind, "value": value}, ensure_ascii=False), flush=True)


def server_args():
    candidates = [os.getenv("SIDEASK_CODEX"), "/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex",
                  "/opt/homebrew/lib/node_modules/@openai/codex/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex",
                  shutil.which("codex"), "/opt/homebrew/bin/codex", "/usr/local/bin/codex"]
    binary = next((p for p in candidates if p and os.path.isfile(p) and os.access(p, os.X_OK)), None)
    if not binary:
        raise RuntimeError("未找到 Codex。请设置 SIDEASK_CODEX 为可执行文件路径。")
    args = [binary]
    for feature in "shell_tool unified_exec multi_agent apps plugins remote_plugin browser_use computer_use image_generation hooks code_mode_host view_image".split():
        args += ["--disable", feature]
    for option in ['web_search="disabled"', 'notify=[]', 'project_doc_max_bytes=0',
                   'model_provider="sideask_http"', 'model_providers.sideask_http={name="SideAsk",wire_api="responses",requires_openai_auth=true,supports_websockets=false}']:
        args += ["-c", option]
    args += ["--enable","skip_host_skill_discovery","app-server","--listen","stdio://"]
    return args


def run(turn):
    catalog = turn.get("action") == "models"
    args = server_args()
    with tempfile.TemporaryDirectory(prefix="sideask-turn-") as cwd:
        proc = subprocess.Popen(args, cwd=cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                stderr=subprocess.DEVNULL, text=True)
        events = queue.Queue()
        def read():
            try:
                for line in proc.stdout:
                    events.put(json.loads(line))
            finally:
                events.put(None)
        threading.Thread(target=read, daemon=True).start()
        def write(msg):
            proc.stdin.write(json.dumps(msg)+"\n")
            proc.stdin.flush()
        def request(i, method, params):
            write(dict(id=i,method=method,params=params))
        try:
            request(1,"initialize",{"clientInfo":{"name":"sideask","version":"0.1"},"capabilities":{"experimentalApi":True}})
            deadline = time.monotonic()+(25 if catalog else 180)
            models = []
            config = {}
            assembled = ""
            usage = None
            while time.monotonic()<deadline:
                msg = events.get(timeout=max(.1, deadline-time.monotonic()))
                if msg is None:
                    raise RuntimeError("Codex App Server 提前退出，请检查登录和版本。")
                if "method" in msg and "id" in msg:
                    write({"id":msg["id"],"error":{"code":-32601,"message":"Tools unavailable"}})
                    continue
                if "error" in msg:
                    raise RuntimeError(msg["error"].get("message","Codex error"))
                result = msg.get("result",{})
                if msg.get("id")==1:
                    write({"method":"initialized","params":{}})
                    request(2,"config/read",{"includeLayers":False,"cwd":cwd})
                elif msg.get("id")==2:
                    config=result["config"]
                    if catalog:
                        request(3,"model/list",{"limit":100})
                    else:
                        params={"cwd":cwd,"ephemeral":True,"sandbox":"read-only","approvalPolicy":"never",
                            "baseInstructions":"你是 SideAsk 学习助手。依据当前对话回答问题；有原文或参考资料时，结合它们作答。使用 Markdown 和 LaTeX。只输出回答，不调用工具。"}
                        if turn.get("model"):
                            params["model"]=turn["model"]
                        # An enabled flag alone creates an invalid transport for absent servers.
                        servers=config.get("mcp_servers") or {}
                        overrides={"mcp_servers":{name:{"enabled":False} for name in servers}}
                        if turn.get("effort"):
                            overrides["model_reasoning_effort"]=turn["effort"]
                        params["config"]=overrides
                        request(4,"thread/start",params)
                elif msg.get("id")==4:
                    thread=result["thread"]
                    if thread.get("ephemeral") is not True:
                        raise RuntimeError("无法确认临时线程，已中止。")
                    params={"threadId":thread["id"],"input":[{"type":"text","text":turn["prompt"]}],
                            "approvalPolicy":"never","sandboxPolicy":{"type":"readOnly","networkAccess":False}}
                    if turn.get("effort"):
                        params["effort"]=turn["effort"]
                    request(5,"turn/start",params)
                elif catalog and msg.get("id")==3:
                    for m in result["data"]:
                        if not m.get("hidden"):
                            models.append({"id":m["model"],"name":m["displayName"],"efforts":[e["reasoningEffort"] for e in m["supportedReasoningEfforts"]],
                                           "defaultEffort":m["defaultReasoningEffort"],"default":m["isDefault"]})
                    if result.get("nextCursor"):
                        request(3,"model/list",{"limit":100,"cursor":result["nextCursor"]})
                    else:
                        default_model=config.get("model") or next((m["id"] for m in models if m["default"]),None)
                        default_effort=config.get("model_reasoning_effort") or next((m["defaultEffort"] for m in models if m["id"]==default_model),None)
                        output("models",{"models":models,"model":default_model,"effort":default_effort})
                        return
                method=msg.get("method")
                params=msg.get("params",{})
                if method=="thread/tokenUsage/updated":
                    reported=params.get("tokenUsage",{}).get("total",{}).get("totalTokens")
                    if isinstance(reported,int) and reported>=0:
                        usage=reported
                elif method=="item/agentMessage/delta":
                    assembled+=params["delta"]
                    output("text",assembled)
                elif method=="item/completed" and params["item"].get("type")=="agentMessage":
                    assembled=params["item"]["text"]
                    output("text",assembled)
                elif method=="turn/completed":
                    completed=params["turn"]
                    if completed["status"]!="completed" or not assembled.strip():
                        raise RuntimeError((completed.get("error") or {}).get("message","Codex 未完成回答"))
                    if usage is not None:
                        output("usage",usage)
                    output("done",assembled)
                    return
            raise TimeoutError("Codex 响应超时")
        finally:
            proc.stdin.close()
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()


if __name__=="__main__":
    try:
        turn = json.load(sys.stdin)
        if turn.get("materials"):
            turn["prompt"] = with_sources(turn["prompt"], Path(turn["materials"]))
        run(turn)
    except Exception as error:
        output("error",str(error) or "连接超时，请检查网络或 Codex 登录。")
        sys.exit(1)
