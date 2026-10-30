/*
 * Simplified Chinese (zh-CN) text for the interface. Keys are the English
 * texts of the page (see js/i18n.js); `npm run check:languages` lists any
 * that are missing or no longer used. Film and product names are data and
 * stay as they are.
 */
(function (root, lang) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = lang;
  // It may load before js/i18n.js, which takes it from this queue.
  else ((root.DX = root.DX || {}).languageFiles = root.DX.languageFiles || []).push(lang);
})(typeof globalThis !== 'undefined' ? globalThis : this, {
  code: 'zh-CN',
  name: '简体中文',
  punctuation: { comma: '，', list: '、', colon: '：', semicolon: '；', period: '。', sentence: '。', space: '' },
  strings: {
    // site/js/app.js
    "{film}, frame {frame}":
      "{film}，画幅 {frame}",
    "{film}, older 7-bar code":
      "{film}，旧式 7 根细条编码",
    "Start at cell 7, right after the fixed start pattern. Drag to fill several cells; keys 1 and 0 type bars and gaps.":
      "从第 7 位开始，就在固定的输入模式后面。拖动可一次填满多个单元；按 1 和 0 键输入条和空。",
    "Cell {cell} should always be empty.":
      "第 {cell} 位应始终为空。",
    "The parity check fails: one bar is probably misread. See the suggestions below.":
      "奇偶检验未通过：可能有一根条读错了。请看下面的建议。",
    "Not a valid code yet: see below.":
      "还不是有效编码：见下文。",
    "Part 1 is 0. This is unlikely.":
      "第 1 部分为 0。这不太可能。",
    "Valid code. No frame number present.":
      "有效编码。不含画幅号。",
    "Valid code, unless your top row has only 7 thin bars: see below.":
      "有效编码，除非你的胶片时钟道只有 7 根细条：见下文。",
    "Valid code. Frame {frame}.":
      "有效编码。画幅号 {frame}。",
    "The photo reader could not be loaded. Choose “Read a photo” to try again.":
      "无法加载照片读取功能。再次选择“读取照片”即可重试。",

    // site/js/ui-finder.js
    "e.g. Portra 400, HP5, Fujicolor 200, 79-15":
      "例如 Portra 400、HP5、Fujicolor 200、79-15",
    "Type at least two letters, or a DX number such as 79-15.":
      "至少输入两个字母，或输入 DX 码，例如 79-15。",
    "Show more":
      "显示更多",
    "Show examples":
      "显示示例",
    "Hide examples":
      "隐藏示例",
    "{maker}. In production in 2008.":
      "{maker}。2008 年仍在生产。",
    "{maker}. Discontinued by 2008.":
      "{maker}。截至 2008 年已停产。",
    "Made by {maker}":
      "由 {maker} 生产",
    "The registry does not give the Part 2 number for this film":
      "年度报告没有给出这种胶片的第 2 部分编号",
    "This cassette number is outside the range a film edge code can hold":
      "这个暗盒条码超出了潜影条码能表示的范围",
    "Part 1 would be 0, which no maker held in 2008":
      "第 1 部分会是 0，而 2008 年时它没有分配给任何感光厂",
    "Show barcode of {name}":
      "显示条码：{name}",
    "Show barcode":
      "显示条码",
    "No full code":
      "无完整编码",
    "cassette {number}":
      "暗盒 {number}",
    "I3A 2008":
      "I3A 2008",
    "Community":
      "社区",
    "Show {n} more":
      "再显示 {n} 条",
    "Nothing matches “{q}”. Try fewer words, or part of the name.":
      "没有与“{q}”匹配的结果。试试少输入几个词，或只输入名称的一部分。",
    "No film in the lists has DX {dx}.":
      "列表中没有 DX 码为 {dx} 的胶片。",
    "DX number as 79-15, or the 4-digit form 1279. Frame as printed: 23, 23A, X, 00 …":
      "DX 码写作 79-15，或四位数形式 1279。画幅号按片边印的写：23、23A、X、00……",
    "DX number":
      "DX 码",
    "Frame":
      "画幅号",
    "That is not a DX number. Part 1 runs from 0 to 127 and Part 2 from 0 to 15, e.g. 79-15.":
      "这不是 DX 码。第 1 部分的范围是 0–127，第 2 部分是 0–15，例如 79-15。",
    "Write the frame as printed, e.g. 23, 23A, X, 00.":
      "请按胶片上印的写画幅号，例如 23、23A、X、00。",
    "Showing DX {dx}, frame {frame}.":
      "正在显示 DX {dx}，画幅 {frame}。",
    "Film name, maker or DX number":
      "胶片名称、制造厂或 DX 码",
    "Show with frame":
      "显示的画幅号",
    "as printed, e.g. 12 or 12A":
      "按片边印的写，例如 12 或 12A",
    "Know the number already?":
      "已经知道 DX 码了？",
    "Printed between the barcode and the film slot.":
      "印在条码与暗盒嘴之间。",
    "Cassette number":
      "暗盒条码",
    "Look up":
      "查询",
    "First digit":
      "首位数字",
    "For the maker’s own use; 0 if unused.":
      "供制造厂自行安排；不用时为 0。",
    "{extract} is above 8191, so it is not a DX number.":
      "{extract} 大于 8191，所以不是 DX 码。",
    "Last digit {digit}":
      "末位数字 {digit}",
    "{n} exposures":
      "{n} 张",
    "The 1994 standard used it for {n} exposures.":
      "1994 年的标准用它表示 {n} 张。",
    "The 1994 standard used it for other lengths, such as 24 + 3.":
      "1994 年的标准用它表示其他长度，例如 24 + 3 张。",
    "The 1994 standard did not use it.":
      "1994 年的标准没有使用它。",
    "{n} or more exposures":
      "{n} 张或更多",
    "{from}–{to} exposures":
      "{from}–{to} 张",
    "{extract} = 16 × {cassette} + {part2}: an augmented number, which only cassettes carry.":
      "{extract} = 16 × {cassette} + {part2}：这是只用在暗盒上的增补编号。",
    "Part 1 {cassette} is {part1} + {added}. Part 1 = {part1} is assigned to {maker} in the 2008 registry; under the standard, a maker adds 128, 256 or 384 only to its own Part 1 number. The standard does not say which DX number the film carries.":
      "第 1 部分 {cassette} 是 {part1} + {added}。在 2008 年年度报告中，第 1 部分 = {part1} 分配给了 {maker}；按照标准，感光厂只在自己的第 1 部分编号上加 128、256 或 384。标准没有规定这种暗盒里的胶片带哪个 DX 码。",
    "Part 1 {cassette} is {part1} + {added}; Part 1 = {part1} was not assigned in the 2008 registry. The standard does not say which DX number the film carries.":
      "第 1 部分 {cassette} 是 {part1} + {added}；在 2008 年年度报告中，第 1 部分 = {part1} 没有分配。标准没有规定这种暗盒里的胶片带哪个 DX 码。",
    "I3A registry, 2008":
      "I3A 年度报告，2008 年",
    "Listed by Kodak as an “augmented” cassette number (ISO 1007, Annex A.4), outside the normal DX range.":
      "柯达登记的“augmented”（增补）暗盒条码（ISO 1007，附录 A.4），在常规 DX 范围之外。",
    "Part 1 = {part1} is assigned to {maker}.":
      "第 1 部分 = {part1} 分配给了 {maker}。",
    "Part 1 = {part1} was not assigned in the 2008 registry.":
      "在 2008 年年度报告中，第 1 部分 = {part1} 没有分配。",
    "Show the edge barcode":
      "显示潜影条码",
    "Enter exactly six digits, for example 017563.":
      "请输入正好六位数字，例如 017563。",
    "{n} films found.":
      "找到 {n} 种胶片。",
    "{n} other films use the same DX number":
      "另有 {n} 种胶片使用相同的 DX 码",
    "{n} other films have the same middle four digits":
      "另有 {n} 种胶片的中间四位数字相同",

    // site/js/ui-photo.js
    "Sample: a computer-drawn color negative.":
      "示例：电脑绘制的彩色负片。",
    "Sample: a computer-drawn slide.":
      "示例：电脑绘制的反转片。",
    "Sample: a computer-drawn black-and-white negative, seen from the back.":
      "示例：电脑绘制的黑白负片，从背面看。",
    "This image has almost no contrast. Try a sharper, closer photo of the film edge.":
      "这张图片几乎没有反差。请换一张更清晰、离片边更近的照片。",
    "The barcode’s top row was not found. Turn the image so the film edge runs left to right and draw a box around one barcode, or try a sharper photo in even light.":
      "没有找到条码的时钟道。请旋转图片，使片边从左到右水平，再画一个框选中一个条码；或者在均匀的光线下拍一张更清晰的照片。",
    "The lower row could not be read. Make sure the box includes both rows, or try a sharper photo.":
      "无法读取数据道。请确认两道都在框内，或换一张更清晰的照片。",
    "A barcode was found but could not be read reliably. Straighten the image, or draw a box around one barcode.":
      "找到了条码，但无法可靠读取。请拉直图片，或画一个框选中一个条码。",
    "This barcode looks cut off or damaged at its end. Leave a little room at both ends of the box, or try a sharper photo.":
      "这个条码的末端看起来被截断或有损伤。请在框的两端各留一点空间，或换一张更清晰的照片。",
    "Photo of the film edge":
      "片边照片",
    "Choose a photo":
      "选择照片",
    "Try a sample":
      "试用示例",
    "Check the barcode":
      "检查条码",
    "Read again":
      "重新读取",
    "Use the code":
      "使用编码",
    "The code from your photo is on the strip below.":
      "照片中的编码已显示在下方的片条上。",
    "Open the photo":
      "打开照片",
    "From your photo":
      "来自你的照片",
    "{name}, frame {frame}":
      "{name}，画幅 {frame}",
    "From Find a film":
      "来自“查找胶片”",
    "Back to the search":
      "回到搜索",
    "From a cassette number":
      "来自暗盒条码",
    "Back to the cassette number":
      "回到暗盒条码",
    "From the code list":
      "来自 DX 码列表",
    "Back to the code list":
      "回到 DX 码列表",
    "Example":
      "示例",
    "Look up DX {dx} on The Big Film Database":
      "在 The Big Film Database 上查看 DX {dx}",
    "The site has pictures of the films":
      "该网站有这些胶卷的图片",
    "(opens in a new tab)":
      "（在新标签页中打开）",
    "Hide where this code came from":
      "隐藏编码来源",
    "edited since":
      "之后已修改",
    "Your photo":
      "你的照片",
    "Remove the photo":
      "移除照片",
    "Drop an image here, paste one, or":
      "把图片拖到这里、粘贴图片，或者",
    "A close-up of the film edge works best. The image stays on your device and is never transmitted to the server.":
      "片边特写效果最好。图片只留在你的设备上，永远不会传送到服务器。",
    "Rotate left 90 degrees":
      "向左旋转 90 度",
    "Rotate right 90 degrees":
      "向右旋转 90 度",
    "Flip":
      "翻转",
    "Find the barcode":
      "查找条码",
    "Clear selection":
      "清除选区",
    "Turn":
      "旋转",
    "Straighten":
      "拉直",
    "{n} degrees":
      "{n} 度",
    "Turn the image so the film edge runs left to right, then drag a box around one barcode (both rows), or click two opposite corners. Without a box, the whole image is searched.":
      "旋转图片，使片边从左到右水平，再拖一个框选中一个条码（两道都要框进去），或者依次点击框的两个对角。不框选时会搜索整张图片。",
    "Arrow keys move the box; Shift and arrows resize it. Enter reads, Escape clears.":
      "方向键移动框；按住 Shift 键再按方向键可改变框的大小。按 Enter 键读取，按 Esc 键清除。",
    "That file is not an image.":
      "这个文件不是图片。",
    "Opening the photo…":
      "正在打开照片……",
    "Your photo, {width} × {height} pixels.":
      "你的照片，{width} × {height} 像素。",
    "This image could not be opened. Try a JPEG, PNG or WebP file.":
      "无法打开这张图片。请试试 JPEG、PNG 或 WebP 文件。",
    "Show another sample":
      "换一个示例",
    "Looking for the barcode…":
      "正在查找条码……",
    "This part of the image could not be read. Select the barcode again, or clear the selection.":
      "无法读取图片的这一部分。请重新框选条码，或清除选区。",
    "No barcode found.":
      "没有找到条码。",
    "DX {dx}, frame {frame}":
      "DX {dx}，画幅 {frame}",
    "The film is mirrored or upside down in this photo; the code was read in the right direction anyway.":
      "照片中的胶片是镜像或倒置的；编码仍按正确的方向读取了。",
    "Clear bars on a dark edge: read as slide film.":
      "深色片边上的透明条：按反转片读取。",
    "An older 7-bar code, without a frame number.":
      "旧式 7 根细条编码，不含画幅号。",
    "Some cells were hard to tell apart; compare the result with your film.":
      "有些单元难以分辨；请把结果和你的胶片对照。",
    "The bars are faint or damaged in this photo; compare the result with your film.":
      "这张照片里的条较淡或有损伤；请把结果和你的胶片对照。",
    "If the top row of your film has 11 thin bars, not 7, this reading is incomplete: read it again with a little room at both ends of the barcode.":
      "如果你胶片的时钟道有 11 根细条而不是 7 根，这个读数就不完整：请在条码两端各留一点空间后重新读取。",
    "The code as read does not pass all checks. Use it, then look at the suggested corrections.":
      "读出的编码没有通过全部检查。请使用它，然后查看建议的修正。",
    "Use this code":
      "使用此编码",
    "not in the lists":
      "不在列表中",
    "Outlined in the photo: the cells that were read, top row in blue, lower row in yellow (bold outline = bar).":
      "照片中框出了读取的单元：时钟道为蓝色，数据道为黄色（粗框 = 条）。",

    // site/js/ui-reference.js
    "Filter products":
      "筛选产品",
    "All manufacturers":
      "所有感光厂",
    "Any status":
      "任何状态",
    "In production in 2008":
      "2008 年仍在生产",
    "Discontinued by 2008":
      "截至 2008 年已停产",
    "Show all Part 1 numbers":
      "显示所有第 1 部分编号",
    "Assigned for APS film":
      "分配给 APS 胶片",
    "Part 1 number {n}, APS film: show its products":
      "第 1 部分编号 {n}，APS 胶片：显示其产品",
    "Part 1 number {n}: show its products":
      "第 1 部分编号 {n}：显示其产品",
    "Part 1 numbers by manufacturer. APS numbers are marked with a dot.":
      "按感光厂列出的第 1 部分编号。APS 编号用圆点标出。",
    "Manufacturer":
      "感光厂",
    "Part 1 numbers":
      "第 1 部分编号",
    "Not assigned in 2008":
      "2008 年未分配",
    "Earlier assignments":
      "以前的分配",
    "Show the barcode of {name}":
      "显示 {name} 的条码",
    "Part 2 not identified in the registry":
      "年度报告中没有给出第 2 部分",
    "Show":
      "显示",
    "in production":
      "在产",
    "discontinued":
      "停产",
    "{n} of {total} registered products.":
      "年度报告中共有 {total} 个产品，显示 {n} 个。",
    "No registered products match these filters.":
      "没有符合这些筛选条件的产品。",
    "{n} of {total} registered products with Part 1 = {part1}.":
      "年度报告中共有 {total} 个产品，显示其中第 1 部分 = {part1} 的 {n} 个。",
    "No registered products with Part 1 = {part1} match these filters.":
      "没有第 1 部分 = {part1} 且符合这些筛选条件的产品。",
    "Product or DX number":
      "产品或 DX 码",
    "Status in 2008":
      "2008 年的状态",
    "Product":
      "产品",
    "Status":
      "状态",
    "Barcode":
      "条码",

    // site/js/ui-result.js
    "{from} to today":
      "{from} 至今",
    "from {from}":
      "{from} 起",
    "until {to}":
      "至 {to}",
    "{from} to {to}":
      "{from} 至 {to}",
    "possibly discontinued":
      "可能已停产",
    "on the market":
      "在售",
    "sold by {distributor}":
      "经销商 {distributor}",
    "Notes: {notes}":
      "备注：{notes}",
    "How sure the database is about this (0 = guess, 4 = certain)":
      "数据库对此有多确定（0 = 猜测，4 = 确定）",
    "(certainty {n}/4)":
      "（可信度 {n}/4）",
    "Certainty {n}/4":
      "可信度 {n}/4",
    "in production in 2008":
      "2008 年仍在生产",
    "discontinued by 2008":
      "截至 2008 年已停产",
    "Listed by I3A for this Part 1 without a Part 2 number.":
      "I3A 在这个第 1 部分下列出了它，但没有第 2 部分编号。",
    "Show all {n}":
      "显示全部 {n} 条",
    "Community-maintained.":
      "由社区维护。",
    "Cell {cell} should never have a bar":
      "第 {cell} 位不应该有条",
    "The copy is probably shifted by one cell: line up the top row’s wide mark with the start of the strip and compare again.":
      "抄写可能错开了一位：请把时钟道的宽标记对准片条的起点，再对照一次。",
    "The parity check fails":
      "奇偶检验未通过",
    "One bar is probably misread: check faint or scratched bars, or the next code along the film.":
      "可能有一根条读错了：请检查模糊或有划痕的条，或胶片上的下一个条码。",
    "The start pattern is not the standard one":
      "输入模式与标准不符",
    "These cells are identical on every DX code.":
      "这些位在所有 DX 编码上都相同。",
    "The stop pattern is not the standard one":
      "输出模式与标准不符",
    "fixed pattern":
      "固定模式",
    "should be {pattern}":
      "应为 {pattern}",
    "empty, as it should be":
      "空白，正确",
    "should be empty":
      "应为空白",
    "{value} (printed {label})":
      "{value}（印作 {label}）",
    "A position":
      "A 位置",
    "whole frame":
      "全画幅位置",
    "expected {bit}, matches":
      "应为 {bit}，相符",
    "expected {bit}, does not match":
      "应为 {bit}，不符",
    "Start":
      "输入模式",
    "Part 1":
      "第 1 部分",
    "Unused":
      "未指定位",
    "Part 2":
      "第 2 部分",
    "A flag":
      "A 标志",
    "Parity":
      "奇偶检验位",
    "Stop":
      "输出模式",
    "Field":
      "字段",
    "Cells":
      "位",
    "Bits":
      "二进制",
    "Value":
      "值",
    "Link to this code":
      "这个编码的链接",
    "Copy failed: copy the link below":
      "复制失败：请复制下方的链接",
    "Waiting for bars":
      "等待输入条",
    "Copy the lower row of your barcode":
      "抄写条码的数据道",
    "Read a photo of your barcode":
      "读取你的条码照片",
    "Not sure what a barcode looks like? Try an example:":
      "不知道条码长什么样？试试示例：",
    "Only 7 thin bars in your top row?":
      "你的胶片时钟道只有 7 根细条？",
    "Then it is an older code without a frame number: the film is still DX {dx}, but ignore the frame below. With 11 thin bars, the reading is right.":
      "那么这是不含画幅号的旧式条码：胶片仍是 DX {dx}，但请忽略下面的画幅号。如果有 11 根细条，读数就是对的。",
    "Switch to 7 thin bars":
      "切换到 7 根细条",
    "{dx}, frame {frame}":
      "{dx}，画幅 {frame}",
    "Remove the bar in cell {cell}":
      "去掉第 {cell} 位的条",
    "Add the bar in cell {cell}":
      "在第 {cell} 位加一根条",
    "{code}: {name}":
      "{code}：{name}",
    "{code} (not in the lists)":
      "{code}（不在列表中）",
    "Possible one-bar corrections":
      "只改一位的可能修正",
    "No single-bar correction gives a listed film.":
      "只改一位得不到列表中的任何胶片。",
    "DX {dx}, not in the lists":
      "DX {dx}，不在列表中",
    "Unlisted {maker} film":
      "未列出的 {maker} 胶片",
    "Unregistered DX number":
      "未登记的 DX 码",
    "As copied: {title}":
      "按你抄写的条码：{title}",
    "Part 1 = {part1} is assigned to {maker}, for APS film.":
      "第 1 部分 = {part1} 分配给了 {maker}，用于 APS 胶片。",
    "Part 1 = {part1} was not assigned to any manufacturer in the 2008 registry.":
      "在 2008 年年度报告中，第 1 部分 = {part1} 没有分配给任何感光厂。",
    "History: {history}":
      "历史：{history}",
    "Not in the 2008 registry; the name comes from the community database.":
      "不在 2008 年年度报告中；名称来自社区数据库。",
    "Not found in either the 2008 I3A registry or The Big Film Database.":
      "在 2008 年 I3A 年度报告和 The Big Film Database 中都没有找到。",
    "Part 1 = {part1}, Part 2 = {part2}":
      "第 1 部分 = {part1}，第 2 部分 = {part2}",
    "Half-frame (A) position":
      "半画幅（A）位置",
    "Whole-frame position":
      "全画幅位置",
    "also printed as {labels}":
      "也印作 {labels}",
    "half-frame count {n}":
      "半画幅计数 {n}",
    "before frame 0":
      "在画幅 0 之前",
    "Printed frame label":
      "肉眼可读的画幅号",
    "none":
      "无",
    "The 23-cell layout has no frame number.":
      "23 位条码没有画幅号。",
    "The middle four digits of this film’s cassette barcode. The first digit is chosen by the maker, the last gives the roll length.":
      "这种胶片暗盒条码中间的四位数字。首位数字由制造厂自行安排，末位表示可拍摄画幅数。",
    "Valid DX code (23-cell layout)":
      "有效的 DX 编码（23 位条码）",
    "Valid DX code":
      "有效的 DX 编码",
    "The code does not pass its checks yet, so this will probably change once the misread bar is fixed.":
      "编码还没有通过检查，所以改正读错的条之后，这里可能会变。",
    "Copy link":
      "复制链接",
    "Link copied":
      "链接已复制",
    "Raw fields":
      "原始字段",
    "Data track":
      "数据道",
    "Clock track":
      "时钟道",
    "Text form (as used by zxing-cpp and Zint)":
      "文本形式（zxing-cpp 和 Zint 使用的格式）",
    "Cassette numbers {numbers}":
      "暗盒条码 {numbers}",
    "{n} other corrections give valid but unlisted codes":
      "另有 {n} 个修正能得到有效但未列出的编码",
    "{n} problems to check":
      "有 {n} 个问题需要检查",

    // site/js/ui-strip.js
    "start pattern":
      "输入模式",
    "unused cell":
      "未指定位",
    "frame number":
      "画幅号",
    "half-frame flag":
      "半画幅标志",
    "parity":
      "奇偶检验位",
    "stop pattern":
      "输出模式",
    "Same on every film":
      "所有胶片都相同",
    "Cell {cell} of {total}: {field}, weight {weight}":
      "第 {cell} 位（共 {total} 位）：{field}，对应数字 {weight}",
    "Cell {cell} of {total}: {field}":
      "第 {cell} 位（共 {total} 位）：{field}",
    "Data track, lower row: press a cell to add or remove a bar. Arrow keys move, 1 and 0 type bars and gaps.":
      "数据道（下方）：点按一个单元可添加或去掉条。方向键移动，按 1 和 0 键输入条和空。",
    "Unused: always empty":
      "未指定位：始终为空",
    "Swipe sideways or turn your phone to landscape.":
      "左右滑动，或者把手机横过来。",
    "Swipe sideways to see the whole code.":
      "左右滑动可以看到整个编码。",

    // site/index.html
    "Identify 35 mm film from the DX barcode on the edge of your negatives and slides: the film, its maker and the frame number.":
      "根据负片和反转片片边上的 DX 潜影条码识别 35mm 胶片，查出胶片、制造厂和画幅号。",
    "DX Film Edge Decoder":
      "DX 潜影条码解码器",
    "Skip to the decoder":
      "跳到解码器",
    "DX Film Edge Decoder, back to top":
      "DX 潜影条码解码器，返回顶部",
    "Sections":
      "页面各部分",
    "Decoder":
      "解码器",
    "Find a film":
      "查找胶片",
    "Cassette":
      "暗盒",
    "How it works":
      "原理",
    "Code list":
      "DX 码列表",
    "Language":
      "语言",
    "Switch to light theme":
      "切换到浅色主题",
    "Switch to dark theme":
      "切换到深色主题",
    "Identify a film from the barcode on its edge":
      "从片边的潜影条码识别胶片",
    "Not sure which film your negatives or slides are? They can tell you themselves. Most 35&nbsp;mm film made since 1983 has a DX barcode along one edge. Copy its bars, or read them from a photo, to find the film, its maker and the frame number.":
      "不确定你的负片或反转片是哪种胶片？它们自己就能告诉你。1983 年以后生产的 35mm 胶片大多在一侧片边上带有 DX 潜影条码。抄下条码，或者从照片中读取，就能查到胶片名称、制造厂和画幅号。",
    "How to enter the code":
      "输入编码的方式",
    "Copy the bars":
      "手动抄写",
    "Read a photo":
      "读取照片",
    "Hide the introduction":
      "收起简介",
    "Show the introduction":
      "展开简介",
    "How to copy the bars":
      "如何抄写条码",
    "Two touching rows of small bars between the sprocket holes and the film edge, twice per frame. A loupe helps.":
      "片孔和片边之间两道紧挨着的细小条纹，每个画幅出现两次。用放大镜看更清楚。",
    "Turn the film the right way around":
      "把胶片转到正确的方向",
    "Hold it so that it looks like the film strip shown below. Turn on <button type=\"button\" class=\"inline-button\" data-for=\"mirror-toggle\">Mirror</button> to flip the strip left to right.":
      "拿着胶片，让它看起来和下面画出的片条一样。打开<button type=\"button\" class=\"inline-button\" data-for=\"mirror-toggle\">镜像</button>可以左右翻转片条。",
    "Copy the lower row":
      "抄写数据道",
    "Click each cell of the lower row where your film has a bar, or drag across several. The rest is the same on every film and already drawn. If your top row has only 7 thin bars, choose <button type=\"button\" class=\"inline-button\" data-for=\"format-short\">7 thin bars</button>.":
      "在数据道中，你的胶片上哪个单元有条，就点击哪个单元，也可以拖过多个单元。其余部分在所有胶片上都相同，已经画好了。如果你的胶片时钟道只有 7 根细条，请选择<button type=\"button\" class=\"inline-button\" data-for=\"format-short\">7 根细条</button>。",
    "Layout":
      "条码类型",
    "11 thin bars":
      "11 根细条",
    "7 thin bars":
      "7 根细条",
    "Which layout do I have?":
      "我的胶片是哪种条码？",
    "Film look":
      "胶片外观",
    "Color negative":
      "彩色负片",
    "Black-and-white negative":
      "黑白负片",
    "Slide":
      "反转片",
    "Mirror":
      "镜像",
    "Undo":
      "撤销",
    "Redo":
      "重做",
    "Clear":
      "清除",
    "Count the thin bars between the two wide marks of the <strong>top</strong> row. <strong>11 thin bars</strong>: the 31-cell layout with a frame number, from about 1990. <strong>7 thin bars</strong>: the original 23-cell layout from 1983, without a frame number.":
      "数一数<strong>时钟道</strong>两个宽标记之间有几根细条。<strong>11 根细条</strong>：带画幅号的 31 位条码，约 1990 年起使用。<strong>7 根细条</strong>：1983 年最初的 23 位条码，不含画幅号。",
    "Find a film’s code":
      "查找胶片的编码",
    "Search by film name, maker or DX number, then show its barcode on the strip to compare with your film.":
      "按胶片名称、制造厂或 DX 码搜索，再把它的条码显示在片条上，和你的胶片对照。",
    "Have the cassette?":
      "有暗盒吗？",
    "The six digits on a 35&nbsp;mm cassette usually carry the film’s DX number and the roll length. Enter them to identify the film.":
      "135 规格暗盒上的六位数字通常包含胶片的 DX 码和可拍摄画幅数。输入这些数字即可识别胶片。",
    "How the DX edge code works":
      "DX 潜影条码的原理",
    "Kodak introduced DX encoding in 1983. Film for color negative processing carries a <em>latent image</em> barcode along one edge, exposed at the factory and visible after development; on other film it is optional. Lab machines read it to recognize the film and, later, to number the frames.":
      "柯达在 1983 年推出了 DX 编码。供彩色负片加工使用的胶片沿一侧片边带有一个<em>潜影</em>条码，在工厂里曝光，加工后显现；在其他胶片上，它是可选的。冲洗设备读取它来识别胶片，后来也用它给各画幅编号。",
    "Two tracks":
      "时钟道和数据道",
    "The <strong>clock track</strong> on top, nearest the sprocket holes, is the same on every film: a wide mark, a run of thin bars and a shorter wide mark, which machines use to find each cell. The <strong>data track</strong> below holds the information: each cell is a bar (1) or a gap (0).":
      "上面靠近片孔的<strong>时钟道</strong>在所有胶片上都一样：一个宽标记、一串细条和一个较短的宽标记，机器用它找到每一个单元。下面的<strong>数据道</strong>承载信息：每个单元是条（1）或空（0）。",
    "Data track, 31-cell layout (the 23-cell layout has cells 1–18 the same, the parity cell at 19 and the stop pattern at 20–23)":
      "数据道，31 位条码（23 位条码的第 1–18 位相同，第 19 位为奇偶检验位，第 20–23 位为输出模式）",
    "What it holds":
      "内容",
    "<span class=\"swatch swatch--fixed\"></span>Start":
      "<span class=\"swatch swatch--fixed\"></span>输入模式",
    "Always <code>101010</code>, under the wide clock mark.":
      "始终为 <code>101010</code>，位于时钟道宽标记的下方。",
    "<span class=\"swatch swatch--part1\"></span>Part 1":
      "<span class=\"swatch swatch--part1\"></span>第 1 部分",
    "Product class, a 7-bit number with weights 64, 32, 16, 8, 4, 2, 1.":
      "产品类别，7 位二进制数，各位的对应数字为 64、32、16、8、4、2、1。",
    "<span class=\"swatch swatch--blank\"></span>Unused":
      "<span class=\"swatch swatch--blank\"></span>未指定位",
    "Always empty.":
      "始终为空。",
    "<span class=\"swatch swatch--part2\"></span>Part 2":
      "<span class=\"swatch swatch--part2\"></span>第 2 部分",
    "Specifier, a 4-bit number with weights 8, 4, 2, 1.":
      "规格号，4 位二进制数，各位的对应数字为 8、4、2、1。",
    "<span class=\"swatch swatch--frame\"></span>Frame":
      "<span class=\"swatch swatch--frame\"></span>画幅号",
    "Frame number, a 6-bit number with weights 32 to 1.":
      "画幅号，6 位二进制数，对应数字从 32 到 1。",
    "<span class=\"swatch swatch--half\"></span>A":
      "<span class=\"swatch swatch--half\"></span>A",
    "Half-frame flag: a bar means the “A” position between two frames.":
      "半画幅标志：有条表示两个画幅之间的“A”位置。",
    "<span class=\"swatch swatch--parity\"></span>Parity":
      "<span class=\"swatch swatch--parity\"></span>奇偶检验位",
    "Set so that cells 7–25 plus this cell hold an even number of bars.":
      "设置成使第 7–25 位和这一位中的条数合计为偶数。",
    "<span class=\"swatch swatch--fixed\"></span>Stop":
      "<span class=\"swatch swatch--fixed\"></span>输出模式",
    "Always <code>0101</code>, under the shorter clock mark.":
      "始终为 <code>0101</code>，位于时钟道较短标记的下方。",
    "The DX number":
      "DX 码",
    "Part 1 and Part 2 together form the film’s <strong>DX number</strong>, written like <code>79-15</code>. Part 1 numbers were assigned to manufacturers by their industry association (NAPM, then PIMA, then I3A), and each manufacturer used Part 2 to tell its products apart. The cassette usually carries the same number: the middle four digits of its barcode are 16 × Part 1 + Part 2, so 79-15 becomes 1279. A maker may also add 128, 256 or 384 to Part 1 on the cassette alone, so a few cassettes carry a number that cannot appear on the film edge.":
      "第 1 部分和第 2 部分合起来就是胶片的 <strong>DX 码</strong>，写法如 <code>79-15</code>。第 1 部分编号由行业协会（先是 NAPM，后来是 PIMA，再后来是 I3A）分配给各感光厂，每个感光厂再用第 2 部分区分自己的产品。暗盒上通常也是同一个编号：暗盒条码中间的四位数字是 16 × 第 1 部分 + 第 2 部分，所以 79-15 变成 1279。感光厂还可以只在暗盒上给第 1 部分加上 128、256 或 384，所以少数暗盒带有片边上不可能出现的编号。",
    "Frame numbers":
      "画幅号",
    "The 31-cell layout, patented by Kodak in 1990, adds a frame number. The code is printed twice per frame, once at the frame (<code>23</code>) and once halfway to the next (<code>23A</code>), so a notch punched by a printing machine never removes every code. The number printed just before a barcode, to its left when reading, is the number it carries. Before frame 0 the numbers count down: <code>00</code> is stored as 63, <code>X</code> as 62 and <code>XX</code> as 61, so Kodak rolls for example run <code>X</code>, <code>XA</code>, <code>00</code>, <code>00A</code>, <code>0</code>.":
      "31 位条码由柯达在 1990 年取得专利，加入了画幅号。条码每个画幅印两次，一次在该画幅处（<code>23</code>），一次在到下一画幅的半途（<code>23A</code>），所以印片机打的切口不会把所有条码都破坏掉。紧挨在条码前面（阅读时在它左边）的数字，就是它所带的画幅号。在画幅 0 之前，画幅号往回倒数：<code>00</code> 存为 63，<code>X</code> 存为 62，<code>XX</code> 存为 61，所以，例如柯达胶卷上依次是 <code>X</code>、<code>XA</code>、<code>00</code>、<code>00A</code>、<code>0</code>。",
    "Printed label and the value in the frame field (cells 19–24)":
      "肉眼可读的画幅号与画幅号字段（第 19–24 位）中的值",
    "Printed":
      "片边印字",
    "Frame field":
      "画幅号字段",
    "A cell":
      "A 位",
    "Also printed as":
      "也印作",
    "empty / bar":
      "空 / 条",
    "the same number":
      "相同的数字",
    "Edge numbers are exposed at the factory, so they rarely line up exactly with your pictures or your camera’s counter.":
      "片边上的画幅号在工厂里曝光，所以很少正好对准你的照片或相机的计数器。",
    "Older film":
      "较旧的胶片",
    "The original code is shorter: 23 cells, with 7 thin bars in the top row instead of 11, and no frame number. Choose <button type=\"button\" class=\"inline-button\" data-for=\"format-short\">7 thin bars</button> before copying one; if you forget, the decoder points this out and offers to switch.":
      "最初的条码更短：23 位，时钟道只有 7 根细条而不是 11 根，也没有画幅号。抄写这种条码前请选择<button type=\"button\" class=\"inline-button\" data-for=\"format-short\">7 根细条</button>；如果忘了，解码器会指出这一点，并提供切换。",
    "The parity check":
      "奇偶检验",
    "The parity cell is a simple guard against misreading: it holds a bar exactly when Part 1, Part 2, the frame number and the A flag contain an odd number of bars, so the total is always even. When your copy fails the check, one bar is probably wrong. The decoder then lists the single-bar corrections that would give a valid code, starting with known films.":
      "奇偶检验位是防止读错的简单保护：第 1 部分、第 2 部分、画幅号和 A 标志中的条数为奇数时，它有一根条，为偶数时为空，所以总数始终为偶数。如果你的抄写没有通过奇偶检验，可能有一根条错了。解码器会列出只改一位就能得到有效编码的修正，已知胶片排在前面。",
    "Reading direction and film type":
      "阅读方向与胶片类型",
    "Read the code from the wide clock mark. With the film the right way around, usually shiny base side toward you, the printed numbers read normally and the wide mark is on the left; from the other side, everything is mirrored. On slide film the bars show clear on a black edge. The code repeats every half frame, so if a bar is unclear, check the next one.":
      "从时钟道的宽标记开始读。胶片方向正确时（通常是光亮的片基面朝向你），印的数字正常可读，宽标记在左边；从另一面看，一切都是镜像的。在反转片上，条在黑色的片边上显示为透明。条码每半个画幅重复一次，所以如果某根条看不清，可以看下一个条码。",
    "What the code cannot tell you":
      "编码不能告诉你什么",
    "The DX number names a product. The product name usually includes the speed, but not always. The official list used here dates from 2008, so films introduced later are identified from community reports. Many films are also sold under several names, and the edge code is exposed by the factory that made the film, so one code can belong to a whole family of rebranded films.":
      "DX 码代表一种产品。产品名称通常带有感光度，但并非总是如此。这里使用的官方列表是 2008 年的，所以较晚推出的胶片要靠社区资料来识别。很多胶片还以多个名称销售，而潜影条码由生产胶片的工厂曝光，所以一个条码可能对应一整组贴牌胶片。",
    "DX code list":
      "DX 码列表",
    "The Part 1 numbers and products registered with the International Imaging Industry Association, as published in <cite>DX Codes for 135-Size Film</cite> (February 2008). Select a Part 1 number to filter the list.":
      "在国际影像行业协会（I3A）登记的第 1 部分编号和产品，发表于 <cite>DX Codes for 135-Size Film</cite>（2008 年 2 月）。选择一个第 1 部分编号即可筛选列表。",

    // the footer
    "Film data: I3A registry (2008) and <a href=\"sources.html#community-credit\">The Big Film Database</a> (CC BY-SA 4.0). Code: <a href=\"https://github.com/ricebucket/dx-film-edge-decoder\">GPL-3.0 on GitHub</a>. <a href=\"sources.html\">Sources and credits</a>":
      "胶片数据：I3A 年度报告（2008）和 <a href=\"sources.html#community-credit\">The Big Film Database</a>（CC BY-SA 4.0）。代码：<a href=\"https://github.com/ricebucket/dx-film-edge-decoder\">GPL-3.0，托管在 GitHub</a>。<a href=\"sources.html\">来源与致谢</a>",
  },
});
