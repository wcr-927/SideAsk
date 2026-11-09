import AppKit
import PDFKit
import Vision

// Keep PDF page numbers intact, including pages with no extractable content.
guard CommandLine.arguments.count == 2,
      let document = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1])),
      !document.isLocked else {
    FileHandle.standardError.write(Data("PDF 已加密或无法打开。".utf8))
    exit(1)
}
var sections = [[String: String]]()
for index in 0..<document.pageCount {
    let text: String = autoreleasepool {
        guard let page = document.page(at: index) else { return "" }
        let selectable = (page.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !selectable.isEmpty { return selectable }
        let image = page.thumbnail(of: NSSize(width: 1600, height: 1600), for: .cropBox)
        guard let bitmap = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return "" }
        let request = VNRecognizeTextRequest()
        request.recognitionLanguages = ["zh-Hans", "en-US"]
        do {
            try VNImageRequestHandler(cgImage: bitmap).perform([request])
            return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
        } catch { return "" }
    }
    sections.append(["location": "第 \(index + 1) 页", "text": text])
}
FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: sections))
