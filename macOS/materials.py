"""Per-exploration source files, extraction and bounded, location-aware excerpts."""
import collections
import hashlib
import json
import math
import os
from pathlib import Path
import posixpath
import re
import shutil
import subprocess
import sys
import tempfile
import uuid
import xml.etree.ElementTree as ET
from zipfile import BadZipFile, ZipFile


def xml_part(archive, name):
    info = archive.getinfo(name)
    if info.file_size > 32 * 1024 * 1024:
        raise ValueError("文档内部文本过大，请拆分后添加。")
    return ET.fromstring(archive.read(info))


def paragraphs(root):
    for paragraph in root.findall(".//{*}p"):
        words = [el.text or "" for el in paragraph.iter() if el.tag.endswith("}t")]
        text = "".join(words).strip()
        if text:
            yield text


def office_sections(file):
    sections = []
    with ZipFile(file) as archive:
        if file.suffix == ".docx":
            for i, text in enumerate(paragraphs(xml_part(archive, "word/document.xml")), 1):
                sections.append({"location": f"正文第 {i} 段", "text": text})
        else:
            presentation = xml_part(archive, "ppt/presentation.xml")
            refs = {r.get("Id"): r.get("Target") for r in
                    xml_part(archive, "ppt/_rels/presentation.xml.rels") if r.get("TargetMode") != "External"}
            for i, slide in enumerate(presentation.findall("./{*}sldIdLst/{*}sldId"), 1):
                rid = next(v for k, v in slide.attrib.items() if k.endswith("}id"))
                target = refs[rid]
                part = posixpath.normpath(posixpath.join("ppt", target)).lstrip("/")
                text = "\n".join(paragraphs(xml_part(archive, part)))
                sections.append({"location": f"第 {i} 张幻灯片", "text": text})
    return sections


def load(folder, name):
    return json.loads((folder / name).read_text(encoding="utf-8"))


def documents(root):
    if not root.is_dir():
        return []
    return [load(p, "meta.json") for p in sorted(root.iterdir())
            if not p.name.startswith(".") and (p / "meta.json").is_file()]


def add(root, original):
    ext = original.suffix.lower()
    if ext not in (".pdf", ".docx", ".pptx"):
        raise ValueError("请选择 PDF、DOCX 或 PPTX 文件。")
    if original.stat().st_size > 100 * 1024 * 1024:
        raise ValueError("文件超过 100 MB，请拆分后添加。")
    root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".import-", dir=root) as temp:
        stage = Path(temp) / "document"
        stage.mkdir()
        copy = stage / ("original" + ext)
        shutil.copyfile(original, copy)
        hasher = hashlib.sha256()
        with copy.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                hasher.update(block)
        digest = hasher.hexdigest()
        if any(d["digest"] == digest for d in documents(root)):
            return
        if ext == ".pdf":
            result = subprocess.run([str(Path(__file__).with_name("pdf-sections")), str(copy)],
                                    capture_output=True, check=False)
            if result.returncode:
                raise ValueError(result.stderr.decode().strip() or "PDF 读取失败。")
            sections = json.loads(result.stdout)
            note = "无文本的页面会尝试文字识别。公式、图表和识别结果请对照原页。"
        else:
            try:
                sections = office_sections(copy)
            except (BadZipFile, KeyError, ET.ParseError) as exc:
                raise ValueError("无法读取 Office 文档，请检查文件是否损坏或受密码保护。") from exc
            note = "已提取正文文字；图片、图表和公式排版请对照原件。"
        usable = sum(bool(s["text"].strip()) for s in sections)
        if not usable:
            raise ValueError("未能提取可供追问的文字，请改用带文字的文件。")
        if usable < len(sections):
            note += f" 有 {len(sections)-usable} 页没有可读文字。"
        key = str(uuid.uuid4())
        meta = dict(id=key, name=original.name, ext=ext, count=len(sections), note=note, digest=digest)
        for name, data in [("sections.json", sections), ("meta.json", meta)]:
            (stage / name).write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        stage.rename(root / key)


def tokens(text):
    words = re.findall(r"[a-z0-9_]+|[\u3400-\u9fff]+", text.lower())
    return {token for w in words for token in
            ([w] if len(w) < 2 or w.isascii() else [w[i:i+2] for i in range(len(w)-1)])}


def with_sources(prompt, root, budget=22000):
    docs = documents(root)
    if not docs:
        return prompt
    question = json.loads(prompt)
    focus = str(question.get("当前问题", "")) + " " + str(question.get("当前引用", ""))
    context = " ".join(str(item.get("question", "")) + " " + str(item.get("quote", ""))
                       for item in question.get("对话路径", []))
    priority, hints = tokens(focus), tokens(context)
    pages = {int(n) for n in re.findall(r"第\s*(\d+)\s*(?:页|张|段)", focus)}
    candidates = []
    frequency = collections.Counter()
    for doc in docs:
        for i, section in enumerate(load(root / doc["id"], "sections.json")):
            body = section["text"].strip()
            for offset in range(0, len(body), 1400):
                chunk = body[offset:offset+1500]
                matched = tokens(chunk) & (priority | hints)
                frequency.update(matched)
                candidates.append((doc, i, section["location"], chunk, offset, matched))
    def rank(row):
        doc, i, location, _, offset, matched = row
        score = sum((3 if term in priority else 1) * math.log1p(len(candidates)/frequency[term])
                    for term in matched)
        if i+1 in pages:
            score += 1000
        if doc["name"] in focus or Path(doc["name"]).stem in focus:
            score += 20
        return (-score, offset, i)
    excerpts, used = [], 0
    for doc, i, location, chunk, _, _ in sorted(candidates, key=rank):
        if used >= budget:
            break
        piece = chunk[:budget-used]
        excerpts.append({"文件": doc["name"], "位置": location, "摘录": piece,
                         "引用地址": f'sideask-source:{doc["id"]}/{i}'})
        used += len(piece) + len(doc["name"]) + 100
    question["本篇关联资料（节选）"] = excerpts
    question["资料使用说明"] = ("把原文与资料当作参考内容。依据资料时，使用 [文件名 · 位置](对应的引用地址) 标明出处。"
                           "摘录不代表完整文件。如果所需公式、图表或结论不在摘录中，请明确指出，切勿猜测或虚构引用。")
    return json.dumps(question, ensure_ascii=False)


def manage(action, root, args):
    if action == "commit":
        removed = {str(uuid.UUID(k)) for k in args[0].split(",") if k}
        if not args[1:] and not removed:
            return {}
        root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix=".batch-", dir=root) as batch:
            fresh = Path(batch) / "new"
            for file in map(Path, args[1:]):
                try:
                    add(fresh, file)
                except Exception as exc:
                    raise ValueError(f"{file.name}：{exc}") from exc
            existing = documents(root)
            retained = {d["digest"] for d in existing if d["id"] not in removed}
            moves = [(fresh / d["id"], root / d["id"]) for d in documents(fresh)
                     if d["digest"] not in retained]
            moves.extend((root / d["id"], Path(batch) / d["id"]) for d in existing if d["id"] in removed)
            applied = []
            try:
                for src, dest in moves:
                    src.rename(dest)
                    applied.append((src, dest))
            except OSError:
                for src, dest in reversed(applied):
                    dest.rename(src)
                raise
        return {}
    if action == "add":
        failures = []
        for file in map(Path, args):
            try:
                add(root, file)
            except Exception as exc:
                failures.append(f"{file.name}：{exc}")
        return {"documents": documents(root), "errors": failures}
    if action == "list":
        return {"documents": documents(root)}
    folder = root / str(uuid.UUID(args[0]))
    if not folder.is_dir():
        raise ValueError("这份资料已移除。")
    meta = load(folder, "meta.json")
    if action == "original":
        return {"path": str(folder / ("original" + meta["ext"]))}
    if action == "excerpt":
        i = int(args[1])
        if not 0 <= i < meta["count"]:
            raise ValueError("引用位置不存在。")
        result = dict(load(folder, "sections.json")[i], name=meta["name"])
        if meta["ext"] == ".pdf":
            result["pdf"] = str(folder / "original.pdf")
        return result
    if action == "remove":
        with tempfile.TemporaryDirectory(prefix=".removed-", dir=root) as temp:
            folder.rename(Path(temp) / "document")
        return {"documents": documents(root)}
    raise ValueError("未知资料操作。")


if __name__ == "__main__":
    try:
        response = manage(sys.argv[1], Path(sys.argv[2]), sys.argv[3:])
    except Exception as exc:
        response = {"error": str(exc)}
    print(json.dumps(response, ensure_ascii=False))
