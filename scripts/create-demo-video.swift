import AppKit
import AVFoundation
import CoreVideo
import Foundation

struct Scene {
    let kind: String
    let heading: String
    let subtitle: String
    let narration: String
    let color: NSColor
}

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let outDir = root.appendingPathComponent("outputs/demo-2026-06-09-v2", isDirectory: true)
try? FileManager.default.removeItem(at: outDir)
try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

let title = "《凌晨三点的撤回消息》"
let novel = """
# \(title)

凌晨三点，林澈收到一条已经被撤回的消息。

发送人是他三年前去世的姐姐。

他盯着手机屏幕，手指发冷。那串熟悉的头像明明早就灰掉了，可聊天框里还是留下了一行系统提示：对方撤回了一条消息。

林澈第一反应是账号被盗。

他打开电脑，查登录记录。最新一次登录地点在城南旧医院，时间是两分钟前。

那家医院早就拆了一半，只剩住院楼还没有爆破。

姐姐生前最后一个电话，就是从那里打来的。

林澈穿上外套，叫了一辆车。司机听见目的地后，回头看了他一眼，说：那个地方晚上没人去。

他没有回答。

半小时后，他站在旧医院门口。铁门被风吹得轻轻晃动，像有人刚刚进去过。

手机又亮了。

这一次，消息没有撤回。

姐姐发来四个字：别上三楼。

林澈抬头看向住院楼。

三楼的尽头，有一盏灯亮着。
"""

let scenes: [Scene] = [
    Scene(kind: "phone", heading: "撤回消息", subtitle: "凌晨三点，死去三年的姐姐发来消息", narration: "凌晨三点，林澈收到一条已经被撤回的消息。发送人，是他三年前去世的姐姐。", color: NSColor(calibratedRed: 0.07, green: 0.09, blue: 0.14, alpha: 1)),
    Scene(kind: "login", heading: "登录记录", subtitle: "最新登录地点：城南旧医院", narration: "他以为账号被盗，立刻查登录记录。最新一次登录地点，在城南旧医院。", color: NSColor(calibratedRed: 0.12, green: 0.16, blue: 0.22, alpha: 1)),
    Scene(kind: "hospital", heading: "旧医院", subtitle: "姐姐最后一个电话，也是从那里打来的", narration: "那家医院早就拆了一半。姐姐生前最后一个电话，就是从那里打来的。", color: NSColor(calibratedRed: 0.15, green: 0.20, blue: 0.22, alpha: 1)),
    Scene(kind: "taxi", heading: "夜路", subtitle: "司机说：那个地方晚上没人去", narration: "林澈叫了一辆车。司机听见目的地后，只说了一句：那个地方晚上没人去。", color: NSColor(calibratedRed: 0.18, green: 0.23, blue: 0.24, alpha: 1)),
    Scene(kind: "gate", heading: "铁门", subtitle: "铁门在风里晃，像有人刚刚进去过", narration: "半小时后，他站在旧医院门口。铁门被风吹得轻轻晃动，像有人刚刚进去过。", color: NSColor(calibratedRed: 0.23, green: 0.25, blue: 0.21, alpha: 1)),
    Scene(kind: "warning", heading: "第二条消息", subtitle: "这一次，消息没有撤回", narration: "手机又亮了。这一次，消息没有撤回。姐姐发来四个字：别上三楼。", color: NSColor(calibratedRed: 0.25, green: 0.18, blue: 0.18, alpha: 1)),
    Scene(kind: "light", heading: "三楼灯光", subtitle: "三楼尽头，有一盏灯亮着", narration: "林澈抬头看向住院楼。三楼的尽头，有一盏灯亮着。", color: NSColor(calibratedRed: 0.29, green: 0.20, blue: 0.16, alpha: 1))
]

try novel.write(to: outDir.appendingPathComponent("novel.md"), atomically: true, encoding: .utf8)

let storyboard = scenes.enumerated().map { index, scene in
    [
        "index": index + 1,
        "heading": scene.heading,
        "subtitle": scene.subtitle,
        "narration": scene.narration
    ] as [String : Any]
}
let storyboardData = try JSONSerialization.data(withJSONObject: ["title": title, "scenes": storyboard], options: [.prettyPrinted, .sortedKeys])
try storyboardData.write(to: outDir.appendingPathComponent("storyboard.json"))

func srtTime(_ seconds: Double) -> String {
    let totalMilliseconds = Int((seconds * 1000).rounded())
    let hours = totalMilliseconds / 3_600_000
    let minutes = (totalMilliseconds % 3_600_000) / 60_000
    let secs = (totalMilliseconds % 60_000) / 1000
    let ms = totalMilliseconds % 1000
    return String(format: "%02d:%02d:%02d,%03d", hours, minutes, secs, ms)
}

let sceneDuration = 4.0
let srt = scenes.enumerated().map { index, scene in
    let start = Double(index) * sceneDuration
    let end = start + sceneDuration
    return """
    \(index + 1)
    \(srtTime(start)) --> \(srtTime(end))
    \(scene.subtitle)

    """
}.joined(separator: "\n")
try srt.write(to: outDir.appendingPathComponent("subtitles.srt"), atomically: true, encoding: .utf8)

let width = 720
let height = 1280
let fps: Int32 = 24
let outputURL = outDir.appendingPathComponent("demo-video.mp4")
let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)
let settings: [String: Any] = [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: width,
    AVVideoHeightKey: height
]
let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
input.expectsMediaDataInRealTime = false
let attributes: [String: Any] = [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
    kCVPixelBufferWidthKey as String: width,
    kCVPixelBufferHeightKey as String: height
]
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: attributes)
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

func drawText(_ text: String, in rect: CGRect, size: CGFloat, color: NSColor, weight: NSFont.Weight = .regular, lineSpacing: CGFloat = 8) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.lineSpacing = lineSpacing
    paragraph.alignment = .left
    let font = NSFont.systemFont(ofSize: size, weight: weight)
    let attrs: [NSAttributedString.Key: Any] = [
        .font: font,
        .foregroundColor: color,
        .paragraphStyle: paragraph
    ]
    (text as NSString).draw(with: rect, options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: attrs)
}

func drawRoundedRect(_ rect: NSRect, radius: CGFloat, color: NSColor) {
    color.setFill()
    NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius).fill()
}

func drawLine(from start: CGPoint, to end: CGPoint, color: NSColor, width: CGFloat = 4) {
    let path = NSBezierPath()
    path.move(to: start)
    path.line(to: end)
    path.lineWidth = width
    color.setStroke()
    path.stroke()
}

func drawSceneVisual(_ scene: Scene, frameIndex: Int, totalFrames: Int) {
    let accent = NSColor(calibratedRed: 0.95, green: 0.79, blue: 0.30, alpha: 1)
    let softWhite = NSColor.white.withAlphaComponent(0.78)
    let dimWhite = NSColor.white.withAlphaComponent(0.18)
    let pulse = CGFloat(frameIndex % 48) / 48.0

    switch scene.kind {
    case "phone":
        drawRoundedRect(NSRect(x: 220, y: 650, width: 280, height: 430), radius: 36, color: NSColor.black.withAlphaComponent(0.45))
        drawRoundedRect(NSRect(x: 242, y: 690, width: 236, height: 350), radius: 18, color: NSColor(calibratedRed: 0.05, green: 0.07, blue: 0.10, alpha: 1))
        drawText("03:00", in: CGRect(x: 278, y: 970, width: 160, height: 42), size: 34, color: softWhite, weight: .bold)
        drawRoundedRect(NSRect(x: 270, y: 850, width: 180, height: 54), radius: 16, color: dimWhite)
        drawText("姐姐", in: CGRect(x: 286, y: 862, width: 120, height: 30), size: 24, color: softWhite, weight: .semibold)
        drawRoundedRect(NSRect(x: 264, y: 780, width: 192, height: 48), radius: 16, color: NSColor(calibratedRed: 0.22, green: 0.27, blue: 0.34, alpha: 1))
        drawText("对方撤回了一条消息", in: CGRect(x: 280, y: 790, width: 170, height: 30), size: 18, color: accent, weight: .medium)
    case "login":
        drawRoundedRect(NSRect(x: 120, y: 690, width: 480, height: 300), radius: 18, color: NSColor.black.withAlphaComponent(0.30))
        drawText("登录记录", in: CGRect(x: 150, y: 930, width: 220, height: 50), size: 34, color: accent, weight: .bold)
        drawText("时间  03:02", in: CGRect(x: 150, y: 860, width: 360, height: 42), size: 28, color: softWhite, weight: .medium)
        drawText("地点  城南旧医院", in: CGRect(x: 150, y: 800, width: 390, height: 42), size: 28, color: softWhite, weight: .medium)
        drawLine(from: CGPoint(x: 170, y: 760), to: CGPoint(x: 510, y: 760), color: accent.withAlphaComponent(0.7), width: 3)
        drawRoundedRect(NSRect(x: 450, y: 730, width: 38 + 12 * pulse, height: 38 + 12 * pulse), radius: 28, color: accent.withAlphaComponent(0.45))
    case "hospital":
        NSColor.black.withAlphaComponent(0.36).setFill()
        NSRect(x: 150, y: 630, width: 420, height: 460).fill()
        for floor in 0..<5 {
            for col in 0..<4 {
                let isLit = floor == 2 && col == 3
                drawRoundedRect(NSRect(x: 190 + col * 82, y: 700 + floor * 68, width: 38, height: 42), radius: 2, color: isLit ? accent : dimWhite)
            }
        }
        drawText("旧医院", in: CGRect(x: 232, y: 1080, width: 260, height: 70), size: 54, color: softWhite, weight: .bold)
        drawLine(from: CGPoint(x: 130, y: 620), to: CGPoint(x: 590, y: 620), color: NSColor.white.withAlphaComponent(0.25), width: 5)
    case "taxi":
        drawLine(from: CGPoint(x: 70, y: 700), to: CGPoint(x: 650, y: 700), color: NSColor.white.withAlphaComponent(0.25), width: 5)
        drawRoundedRect(NSRect(x: 145, y: 720, width: 430, height: 140), radius: 26, color: NSColor.black.withAlphaComponent(0.45))
        drawRoundedRect(NSRect(x: 230, y: 820, width: 210, height: 76), radius: 16, color: NSColor.black.withAlphaComponent(0.35))
        drawText("TAXI", in: CGRect(x: 310, y: 872, width: 100, height: 32), size: 24, color: accent, weight: .bold)
        drawRoundedRect(NSRect(x: 185, y: 685, width: 80, height: 80), radius: 40, color: NSColor.black.withAlphaComponent(0.7))
        drawRoundedRect(NSRect(x: 455, y: 685, width: 80, height: 80), radius: 40, color: NSColor.black.withAlphaComponent(0.7))
        drawText("那个地方晚上没人去", in: CGRect(x: 150, y: 930, width: 420, height: 60), size: 34, color: softWhite, weight: .semibold)
    case "gate":
        drawLine(from: CGPoint(x: 170, y: 650), to: CGPoint(x: 170, y: 1040), color: softWhite, width: 8)
        drawLine(from: CGPoint(x: 550, y: 650), to: CGPoint(x: 550, y: 1040), color: softWhite, width: 8)
        for x in stride(from: 210, through: 510, by: 50) {
            drawLine(from: CGPoint(x: x, y: 665), to: CGPoint(x: x + Int(18 * pulse), y: 1020), color: NSColor.white.withAlphaComponent(0.55), width: 5)
        }
        drawLine(from: CGPoint(x: 170, y: 900), to: CGPoint(x: 550, y: 900), color: softWhite, width: 5)
        drawLine(from: CGPoint(x: 170, y: 760), to: CGPoint(x: 550, y: 760), color: softWhite, width: 5)
        drawText("风吹铁门", in: CGRect(x: 235, y: 1070, width: 260, height: 60), size: 46, color: accent, weight: .bold)
    case "warning":
        drawRoundedRect(NSRect(x: 210, y: 650, width: 300, height: 460), radius: 38, color: NSColor.black.withAlphaComponent(0.45))
        drawRoundedRect(NSRect(x: 232, y: 700, width: 256, height: 360), radius: 18, color: NSColor(calibratedRed: 0.06, green: 0.06, blue: 0.08, alpha: 1))
        drawRoundedRect(NSRect(x: 258, y: 840, width: 204, height: 92), radius: 20, color: NSColor(calibratedRed: 0.32, green: 0.13, blue: 0.13, alpha: 1))
        drawText("别上三楼", in: CGRect(x: 288, y: 865, width: 160, height: 48), size: 36, color: accent, weight: .bold)
        drawText("姐姐", in: CGRect(x: 288, y: 955, width: 120, height: 38), size: 26, color: softWhite, weight: .semibold)
    case "light":
        NSColor.black.withAlphaComponent(0.36).setFill()
        NSRect(x: 150, y: 620, width: 420, height: 480).fill()
        for floor in 0..<5 {
            for col in 0..<4 {
                let isThirdFloorLight = floor == 2 && col == 3
                let alpha = isThirdFloorLight ? 0.75 + 0.2 * sin(pulse * .pi * 2) : 0.16
                drawRoundedRect(NSRect(x: 190 + col * 82, y: 700 + floor * 72, width: 40, height: 46), radius: 2, color: isThirdFloorLight ? accent.withAlphaComponent(alpha) : NSColor.white.withAlphaComponent(alpha))
            }
        }
        drawText("三楼尽头", in: CGRect(x: 220, y: 1090, width: 290, height: 65), size: 52, color: softWhite, weight: .bold)
        drawText("有一盏灯亮着", in: CGRect(x: 210, y: 640, width: 330, height: 52), size: 36, color: accent, weight: .semibold)
    default:
        drawRoundedRect(NSRect(x: 160, y: 710, width: 400, height: 280), radius: 24, color: NSColor.black.withAlphaComponent(0.28))
    }
}

func createBuffer(scene: Scene, frameIndex: Int, totalFrames: Int) -> CVPixelBuffer {
    var buffer: CVPixelBuffer?
    CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32ARGB, nil, &buffer)
    let pixelBuffer = buffer!
    CVPixelBufferLockBaseAddress(pixelBuffer, [])
    let context = CGContext(
        data: CVPixelBufferGetBaseAddress(pixelBuffer),
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
    )!

    NSGraphicsContext.saveGraphicsState()
    let graphicsContext = NSGraphicsContext(cgContext: context, flipped: false)
    NSGraphicsContext.current = graphicsContext

    scene.color.setFill()
    NSRect(x: 0, y: 0, width: width, height: height).fill()

    NSColor.white.withAlphaComponent(0.06).setFill()
    NSBezierPath(roundedRect: NSRect(x: 48, y: 80, width: width - 96, height: height - 160), xRadius: 18, yRadius: 18).fill()

    let progress = CGFloat(frameIndex) / CGFloat(max(totalFrames - 1, 1))
    NSColor(calibratedRed: 0.95, green: 0.79, blue: 0.30, alpha: 1).setFill()
    NSRect(x: 48, y: 82, width: CGFloat(width - 96) * progress, height: 8).fill()

    drawSceneVisual(scene, frameIndex: frameIndex, totalFrames: totalFrames)

    drawText(title, in: CGRect(x: 60, y: 104, width: width - 120, height: 80), size: 28, color: NSColor.white.withAlphaComponent(0.82), weight: .semibold)
    drawText(scene.heading, in: CGRect(x: 60, y: 210, width: width - 120, height: 80), size: 54, color: NSColor(calibratedRed: 0.95, green: 0.79, blue: 0.30, alpha: 1), weight: .bold)
    drawText(scene.subtitle, in: CGRect(x: 60, y: 300, width: width - 120, height: 120), size: 34, color: .white, weight: .semibold, lineSpacing: 10)
    drawText(scene.narration, in: CGRect(x: 60, y: 430, width: width - 120, height: 160), size: 24, color: NSColor.white.withAlphaComponent(0.78), lineSpacing: 10)
    drawText("AIShortvideo 样片 / 基础自动成片", in: CGRect(x: 60, y: 1138, width: width - 120, height: 50), size: 22, color: NSColor.white.withAlphaComponent(0.55), weight: .medium)

    NSGraphicsContext.restoreGraphicsState()
    CVPixelBufferUnlockBaseAddress(pixelBuffer, [])
    return pixelBuffer
}

let framesPerScene = Int(sceneDuration * Double(fps))
var frameNumber: Int64 = 0
for scene in scenes {
    for frame in 0..<framesPerScene {
        while !input.isReadyForMoreMediaData {
            Thread.sleep(forTimeInterval: 0.01)
        }
        let buffer = createBuffer(scene: scene, frameIndex: frame, totalFrames: framesPerScene)
        let time = CMTime(value: frameNumber, timescale: fps)
        adaptor.append(buffer, withPresentationTime: time)
        frameNumber += 1
    }
}

input.markAsFinished()
writer.finishWriting {
    print("Demo generated: \(outputURL.path)")
}
RunLoop.current.run(until: Date().addingTimeInterval(1))
