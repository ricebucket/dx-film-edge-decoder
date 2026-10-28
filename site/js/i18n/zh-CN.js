/*
 * Simplified Chinese (zh-CN) text for the interface. Keys are the English
 * texts of the page (see js/i18n.js); `npm run check:languages` lists any
 * that are missing or no longer used. Film and product names are data and
 * stay as they are.
 */
(function (root, lang) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = lang;
  else root.DX.i18n.register(lang);
})(typeof globalThis !== 'undefined' ? globalThis : this, {
  code: 'zh-CN',
  name: '简体中文',
  punctuation: { comma: '，', colon: '：', semicolon: '；', period: '。', sentence: '。' },
  strings: {
    // site/js/app.js
    "{film}, frame {frame}":
      "{film}，第 {frame} 帧",
    "{film}, older 7-bar code":
      "{film}，旧式 7 根细条编码",
    "Start right after the fixed start pattern: cells 7 to 13 hold Part 1. Drag across cells to fill several at once; keys 1 and 0 type bars and gaps.":
      "从固定的起始符后面开始：第 7–13 位是 Part 1。拖过多个位可一次填满；按 1 和 0 键输入条和空。",
    "Cell {cell} is never used: if you see a bar there, the copy is shifted by one cell.":
      "第 {cell} 位从不使用：如果你在那里看到条，说明抄写错开了一位。",
    "The parity check fails: one bar is probably misread. See the suggestions below.":
      "奇偶校验未通过：可能有一根条读错了。请看下面的建议。",
    "The code does not pass its checks yet: see below.":
      "编码还没有通过校验：见下文。",
    "Part 1 is still 0: add the bars of cells 7 to 13.":
      "Part 1 仍为 0：请补上第 7–13 位的条。",
    "Valid code. The 23-cell layout carries no frame number.":
      "有效编码。23 位版式不含帧号。",
    "Valid code, unless the top row of your film has only 7 thin bars: see below.":
      "有效编码，除非你的胶片上排只有 7 根细条：见下文。",
    "Valid code. On your film, the number printed just before this barcode should read {frame}.":
      "有效编码。在你的胶片上，紧挨在这个条码前面的数字应为 {frame}。",
    "Switch to light theme":
      "切换到浅色主题",
    "Switch to dark theme":
      "切换到深色主题",

    // site/js/ui-finder.js
    "e.g. Portra 400, HP5, Fujicolor 200, 79-15":
      "例如 Portra 400、HP5、Fujicolor 200、79-15",
    "Type at least two letters, or a DX number such as 79-15.":
      "至少输入两个字母，或输入 DX 编号，例如 79-15。",
    "Show more":
      "显示更多",
    "{maker}. In production in 2008.":
      "{maker}。2008 年仍在生产。",
    "{maker}. Discontinued by 2008.":
      "{maker}。2008 年前已停产。",
    "Made by {maker}":
      "由 {maker} 生产",
    "The registry does not give the Part 2 number for this film":
      "登记表没有给出这种胶片的 Part 2 编号",
    "This cassette number is outside the range a film edge code can hold":
      "这个暗盒编号超出了片边码能表示的范围",
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
    "DX number as 79-15, or the 4-digit form 1279. Frame as printed: 23, 23A, X, 00 …":
      "DX 编号写作 79-15，或四位数形式 1279。帧号按片边印的写：23、23A、X、00 …",
    "DX number":
      "DX 编号",
    "Frame":
      "帧号",
    "That is not a DX number. Part 1 runs from 1 to 127 and Part 2 from 0 to 15, e.g. 79-15.":
      "这不是 DX 编号。Part 1 的范围是 1–127，Part 2 是 0–15，例如 79-15。",
    "Part 1 = 0 is never used on film.":
      "胶片上从不使用 Part 1 = 0。",
    "Write the frame as printed on film: a number up to 63, optionally followed by A, or X, 00.":
      "请按胶片上印的写帧号：不超过 63 的数字，后面可加 A；或写 X、00。",
    "Showing DX {dx}, frame {frame}.":
      "正在显示 DX {dx}，第 {frame} 帧。",
    "Film name, maker or DX number":
      "胶片名称、生产商或 DX 编号",
    "Show with frame":
      "显示帧号",
    "as printed, e.g. 12 or 12A":
      "按片边印的写，例如 12 或 12A",
    "Know the number already?":
      "已经知道编号了？",
    "Six digits, printed under the barcode next to the film slot.":
      "六位数字，印在出片口旁边的条码下方。",
    "Cassette number":
      "暗盒编号",
    "Look up":
      "查询",
    "First digit":
      "首位数字",
    "Chosen by the maker.":
      "由生产商自定。",
    "{extract} is above 2047, so it is not a standard DX number.":
      "{extract} 大于 2047，所以不是标准 DX 编号。",
    "Roll length":
      "卷长",
    "{n} exp.":
      "{n} 张",
    "other":
      "其他",
    "Code 7: a non-standard length such as 24 + 3.":
      "代码 7：非标准长度，例如 24 + 3。",
    "Last digit {digit} is not a defined length code.":
      "末位数字 {digit} 不是已定义的长度代码。",
    "Last digit {digit}.":
      "末位数字 {digit}。",
    "Registered special cassette number":
      "登记的特殊暗盒编号",
    "I3A registry, 2008":
      "I3A 登记表，2008 年",
    "Listed by Kodak as an “augmented” cassette number (ISO 1007, Annex A.4), outside the normal DX range.":
      "柯达登记的“augmented”（扩充）暗盒编号（ISO 1007，附录 A.4），在常规 DX 范围之外。",
    "Registered product":
      "登记的型号",
    "Part 1 = {part1} is assigned to {maker}.":
      "Part 1 = {part1} 分配给了 {maker}。",
    "Part 1 = {part1} was not assigned in the 2008 registry.":
      "在 2008 年登记表中，Part 1 = {part1} 没有分配。",
    "Cassettes with this number":
      "使用这个编号的暗盒",
    "This number is not in the 2008 registry or the community database.":
      "这个编号既不在 2008 年登记表中，也不在社区数据库中。",
    "Show the edge barcode":
      "显示片边条码",
    "Enter exactly six digits, for example 017563.":
      "请输入正好六位数字，例如 017563。",
    "Cassette {digits}.":
      "暗盒 {digits}。",
    "{n} films found.":
      "找到 {n} 种胶片。",
    "{n} other films use the same DX number":
      "另有 {n} 种胶片使用相同的 DX 编号",

    // site/js/ui-photo.js
    "Sample: a computer-drawn film edge, a color negative.":
      "示例：电脑绘制的片边，彩色底片。",
    "Sample: a computer-drawn film edge, a slide.":
      "示例：电脑绘制的片边，反转片。",
    "Sample: a computer-drawn film edge, a black-and-white negative seen from the back.":
      "示例：电脑绘制的片边，从背面看的黑白底片。",
    "This image has almost no contrast. Try a sharper, closer photo of the film edge.":
      "这张图片几乎没有反差。请换一张更清晰、离片边更近的照片。",
    "No clock track found: the row with a wide mark, a run of thin bars and a shorter mark. Turn the image so the film edge is horizontal, then drag a box around one barcode, including both rows.":
      "没有找到定位码，也就是有一个宽标记、一串细条和一个较短标记的那一排。请把图片转到片边水平，再拖一个框选中一个条码，包括两排。",
    "The clock track was found, but not a readable data row next to it. Make sure your box includes both rows, or try a sharper photo.":
      "找到了定位码，但旁边没有可读的信息码。请确认框选包括两排，或换一张更清晰的照片。",
    "Something like a barcode was found, but it could not be read reliably. Straighten the image so the film edge runs left to right, or drag a box around one barcode.":
      "找到了类似条码的东西，但无法可靠读取。请拉直图片，让片边从左到右水平，或拖一个框选中一个条码。",
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
    "The code appears here once a photo has been read.":
      "读取照片后，编码会显示在这里。",
    "The code from your photo is on the strip below.":
      "照片中的编码已显示在下方的片条上。",
    "Open the photo":
      "打开照片",
    "From your photo":
      "来自你的照片",
    "{name}, frame {frame}":
      "{name}，第 {frame} 帧",
    "From Find a film":
      "来自“查找胶片”",
    "Back to the search":
      "回到搜索",
    "From a cassette number":
      "来自暗盒编号",
    "Back to the cassette number":
      "回到暗盒编号",
    "From the code list":
      "来自编码列表",
    "Back to the code list":
      "回到编码列表",
    "Example":
      "示例",
    "Look up DX {dx} on The Big Film Database, which has pictures of the film boxes":
      "在 The Big Film Database 上查看 DX {dx}，该网站有胶片包装盒图片",
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
    "A close-up of the film edge works best: phone macro photo, loupe photo or scan. The image stays on your device.":
      "片边特写效果最好：手机微距照片、透过放大镜拍的照片或扫描图。图片只留在你的设备上。",
    "Photo of the film edge. Drag to select one barcode.":
      "片边照片。拖动以选中一个条码。",
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
    "Turn the image so the film edge runs left to right (within a few degrees), then drag a box around one barcode, including both rows. Without a box the whole image is searched.":
      "把图片转到片边从左到右（误差在几度以内），再拖一个框选中一个条码，包括两排。不框选时会搜索整张图片。",
    "That file is not an image.":
      "这个文件不是图片。",
    "Your photo, {width} × {height} pixels.":
      "你的照片，{width} × {height} 像素。",
    "This image could not be opened. JPEG, PNG and WebP photos work in every browser.":
      "无法打开这张图片。JPEG、PNG 和 WebP 照片在所有浏览器中都能打开。",
    "Show another sample":
      "换一个示例",
    "Looking for the barcode…":
      "正在查找条码…",
    "This part of the image could not be read. Select the barcode again, or clear the selection.":
      "无法读取图片的这一部分。请重新框选条码，或清除选区。",
    "No barcode found.":
      "没有找到条码。",
    "DX {dx}, frame {frame}":
      "DX {dx}，第 {frame} 帧",
    "The film is mirrored or upside down in this photo; the code was read in the right direction anyway.":
      "照片中的胶片是镜像或倒置的；编码仍按正确的方向读取了。",
    "Clear bars on a dark edge: read as slide film.":
      "深色片边上的透明条：按反转片读取。",
    "This is the original 23-cell layout without a frame number.":
      "这是最初的 23 位版式，不含帧号。",
    "Some cells were hard to tell apart; compare the result with your film.":
      "有些位难以分辨；请把结果和你的胶片对照。",
    "The code as read does not pass all checks. Use it, then look at the suggested corrections.":
      "读出的编码没有通过全部校验。请使用它，然后查看建议的修正。",
    "Use this code":
      "使用此编码",
    "not in the lists":
      "不在列表中",
    "Outlined in the photo: the cells that were read, clock track in blue, data track in yellow (bold outline = bar).":
      "照片中框出了读取的位：定位码为蓝色，信息码为黄色（粗框 = 条）。",

    // site/js/ui-reference.js
    "Filter products":
      "筛选型号",
    "All manufacturers":
      "所有生产商",
    "Any status":
      "任何状态",
    "In production in 2008":
      "2008 年仍在生产",
    "Discontinued by 2008":
      "2008 年前已停产",
    "Show all Part 1 numbers":
      "显示所有 Part 1 编号",
    "Assigned for APS film":
      "分配给 APS 胶片",
    "Part 1 number {n}, APS film: show its products":
      "Part 1 编号 {n}，APS 胶片：显示其型号",
    "Part 1 number {n}: show its products":
      "Part 1 编号 {n}：显示其型号",
    "Part 1 numbers by manufacturer. APS numbers are marked with a dot.":
      "按生产商列出的 Part 1 编号。APS 编号用圆点标出。",
    "Manufacturer":
      "生产商",
    "Part 1 numbers":
      "Part 1 编号",
    "Not assigned in 2008":
      "2008 年未分配",
    "Earlier assignments":
      "以前的分配",
    "Show the barcode of {name}":
      "显示 {name} 的条码",
    "Part 2 not identified in the registry":
      "登记表中没有给出 Part 2",
    "Show":
      "显示",
    "in production":
      "在产",
    "discontinued":
      "停产",
    "{n} of {total} registered products.":
      "共 {total} 个登记型号，显示 {n} 个。",
    "No registered products match these filters.":
      "没有符合这些筛选条件的登记型号。",
    "{n} of {total} registered products with Part 1 = {part1}.":
      "共 {total} 个登记型号，显示其中 Part 1 = {part1} 的 {n} 个。",
    "No registered products with Part 1 = {part1} match these filters.":
      "没有 Part 1 = {part1} 且符合这些筛选条件的登记型号。",
    "Product or DX number":
      "型号或 DX 编号",
    "Status in 2008":
      "2008 年的状态",
    "Product":
      "型号",
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
    "in production in 2008":
      "2008 年仍在生产",
    "discontinued by 2008":
      "2008 年前已停产",
    "Listed by I3A for this Part 1 without a Part 2 number.":
      "I3A 在这个 Part 1 下列出了它，但没有 Part 2 编号。",
    "Show all {n}":
      "显示全部 {n} 条",
    "Community-maintained and mostly based on cassette numbers, so it includes rebranded films. Entries are as reliable as their sources.":
      "由社区维护，主要依据暗盒编号，所以包含贴牌胶片。条目的可靠程度取决于其来源。",
    "Part 1 is 0, which no film uses":
      "Part 1 为 0，没有胶片使用这个值",
    "Part 1 sits in cells 7 to 13, right after the start pattern. Copy those bars first.":
      "Part 1 位于第 7–13 位，紧接在起始符之后。请先抄写这些条。",
    "Cell {cell} should never have a bar":
      "第 {cell} 位不应该有条",
    "If your film shows a bar there, the copy is probably shifted by one cell. Line the wide mark of the top row up with the start of the strip and compare again.":
      "如果你的胶片在那里有条，抄写可能错开了一位。请把上排的宽标记对准片条的起点，再对照一次。",
    "The parity check fails":
      "奇偶校验未通过",
    "The bars in Part 1, Part 2, the frame number, the A cell and the parity cell should add up to an even number, but there are {n}. One bar is probably misread: look again at faint or scratched bars, or compare with the next code along the film.":
      "Part 1、Part 2、帧号、A 位和校验位中的条加起来应为偶数，但现在有 {n} 根。可能有一根条读错了：请再看看模糊或有划痕的条，或与胶片上的下一个编码对照。",
    "The bars in Part 1, Part 2 and the parity cell should add up to an even number, but there are {n}. One bar is probably misread: look again at faint or scratched bars, or compare with the next code along the film.":
      "Part 1、Part 2 和校验位中的条加起来应为偶数，但现在有 {n} 根。可能有一根条读错了：请再看看模糊或有划痕的条，或与胶片上的下一个编码对照。",
    "The start pattern is not the standard one":
      "起始符不是标准图案",
    "These cells are identical on every DX code.":
      "这些位在所有 DX 编码上都相同。",
    "The stop pattern is not the standard one":
      "终止符不是标准图案",
    "fixed pattern":
      "固定图案",
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
      "整帧",
    "expected {bit}, matches":
      "应为 {bit}，相符",
    "expected {bit}, does not match":
      "应为 {bit}，不符",
    "Start":
      "起始符",
    "Part 1":
      "Part 1",
    "Unused":
      "未使用",
    "Part 2":
      "Part 2",
    "A flag":
      "A 标志",
    "Parity":
      "校验位",
    "Stop":
      "终止符",
    "Field":
      "字段",
    "Cells":
      "位",
    "Bits":
      "二进制",
    "Value":
      "值",
    "Copy failed: select and copy by hand":
      "复制失败：请手动选择并复制",
    "Waiting for bars":
      "等待输入条",
    "Copy the lower row of your barcode":
      "抄写条码的下排",
    "Read a photo of your barcode":
      "读取你的条码照片",
    "The decoding appears here as you go. Not sure what a barcode looks like? Load an example and compare it with your film.":
      "解码结果会随着你的输入显示在这里。不知道条码长什么样？载入一个示例，和你的胶片对照。",
    "Does the top row of your film have 7 thin bars?":
      "你的胶片上排是否有 7 根细条？",
    "Then this is an older 23-cell code without a frame number. The film is the same, DX {dx}, but the frame shown below would be meaningless. With 11 thin bars, the reading below is right as it is.":
      "那么这是不含帧号的旧式 23 位编码。胶片不变，仍是 DX {dx}，但下面显示的帧号没有意义。如果有 11 根细条，下面的读数就是对的。",
    "Switch to 7 thin bars":
      "切换到 7 根细条",
    "{dx}, frame {frame}":
      "{dx}，第 {frame} 帧",
    "Remove the bar in cell {cell}":
      "去掉第 {cell} 位的条",
    "Add the bar in cell {cell}":
      "在第 {cell} 位加一根条",
    "{code}: {name}":
      "{code}：{name}",
    "{code} (not in the lists)":
      "{code}（不在列表中）",
    "Possible one-bar corrections":
      "可能的单条修正",
    "No single-bar correction gives a listed film.":
      "没有哪个单条修正能得到列表中的胶片。",
    "DX {dx}, not in the lists":
      "DX {dx}，不在列表中",
    "Unlisted {maker} film":
      "未列出的 {maker} 胶片",
    "Unregistered DX number":
      "未登记的 DX 编号",
    "As copied: {title}":
      "按抄写：{title}",
    "Part 1 = {part1} is assigned to {maker}, for APS film.":
      "Part 1 = {part1} 分配给了 {maker}，用于 APS 胶片。",
    "Part 1 = {part1} was not assigned to any manufacturer in the 2008 registry.":
      "在 2008 年登记表中，Part 1 = {part1} 没有分配给任何生产商。",
    "History: {history}":
      "历史：{history}",
    "DX {dx} is not in the 2008 registry; the name above comes from the community database.":
      "DX {dx} 不在 2008 年登记表中；上面的名称来自社区数据库。",
    "DX {dx} is in neither the 2008 registry nor the community database. Films introduced after 2008 are often missing.":
      "DX {dx} 既不在 2008 年登记表中，也不在社区数据库中。2008 年以后推出的胶片常常缺失。",
    "Registered products with this number":
      "使用这个编号的登记型号",
    "Also listed for this number":
      "这个编号下另外列出的胶片",
    "Films listed for this number":
      "这个编号下列出的胶片",
    "Part 1 = {part1}, Part 2 = {part2}":
      "Part 1 = {part1}，Part 2 = {part2}",
    "Half-frame (A) position":
      "半帧（A）位置",
    "Whole-frame position":
      "整帧位置",
    "also printed as {labels}":
      "也印作 {labels}",
    "half-frame count {n}":
      "半帧计数 {n}",
    "before frame 0":
      "在第 0 帧之前",
    "Printed frame label":
      "片边帧号",
    "none":
      "无",
    "The 23-cell layout has no frame number.":
      "23 位版式没有帧号。",
    "The middle four digits of this film’s cassette barcode. The first digit is chosen by the maker, the last gives the roll length.":
      "这种胶片暗盒条码中间的四位数字。首位数字由生产商自定，末位表示卷长。",
    "Valid DX code (23-cell layout)":
      "有效的 DX 编码（23 位版式）",
    "Valid DX code":
      "有效的 DX 编码",
    "Not a film code yet":
      "还不是胶片编码",
    "The code does not pass its checks yet, so this will probably change once the misread bar is fixed.":
      "编码还没有通过校验，所以改正读错的条之后，这里可能会变。",
    "Keep copying":
      "继续抄写",
    "Copy link":
      "复制链接",
    "Link copied":
      "链接已复制",
    "Raw fields":
      "原始字段",
    "Data track":
      "信息码",
    "Clock track":
      "定位码",
    "Text form (as used by zxing-cpp and Zint)":
      "文本形式（zxing-cpp 和 Zint 使用的格式）",
    "Cassette numbers {numbers}":
      "暗盒编号 {numbers}",
    "{n} other corrections give valid but unlisted codes":
      "另有 {n} 个修正能得到有效但未列出的编码",
    "{n} problems to check":
      "有 {n} 个问题需要检查",

    // site/js/ui-strip.js
    "start pattern":
      "起始符",
    "unused cell":
      "未使用的位",
    "frame number":
      "帧号",
    "half-frame flag":
      "半帧标志",
    "parity":
      "校验位",
    "stop pattern":
      "终止符",
    "Same on every film":
      "所有胶片都相同",
    "Cell {cell} of {total}: {field}, value {weight}":
      "第 {cell} 位（共 {total} 位）：{field}，对应数字 {weight}",
    "Cell {cell} of {total}: {field}":
      "第 {cell} 位（共 {total} 位）：{field}",
    "Data track, lower row: press a cell to add or remove a bar. Arrow keys move, 1 and 0 type bars and gaps.":
      "信息码（下排）：按一个位可添加或去掉条。方向键移动，1 和 0 键输入条和空。",
    "Unused: always empty":
      "未使用：始终为空",
    "Swipe the strip sideways to reach every cell, or turn your phone to landscape.":
      "左右滑动片条可以看到每一位，或者把手机横过来。",
    "Swipe sideways to see the whole code.":
      "左右滑动可以看到整个编码。",

    // site/index.html
    "DX Film Edge Decoder":
      "DX 片边码解码器",
    "Skip to the decoder":
      "跳到解码器",
    "DX Film Edge Decoder, back to top":
      "DX 片边码解码器，返回顶部",
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
      "编码列表",
    "Language":
      "语言",
    "Identify a film from the barcode on its edge":
      "从片边条码识别胶片",
    "Not sure which film your negatives or slides are? They can tell you themselves. Most 35&nbsp;mm film made since 1983 has a DX barcode along one edge. Copy its bars, or read them from a photo, to find the film, its maker and the frame number.":
      "不确定你的底片或反转片是哪种胶片？它们自己就能告诉你。1983 年以后生产的 35mm 胶片大多在一侧片边上带有 DX 条码。抄下条码，或者从照片中读取，就能查到胶片名称、生产商和帧号。",
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
    "Look at the strip between the sprocket holes and the edge of the film: two touching rows of small bars, about 13&nbsp;mm long, repeated twice per frame. A loupe or a zoomed-in scan helps.":
      "看齿孔和片边之间的窄条：两排紧挨着的细小条纹，长约 13&nbsp;mm，每帧重复两次。用放大镜或放大的扫描图会更容易看清。",
    "Turn the film the right way round":
      "把胶片转到正确的方向",
    "Hold it so the barcode runs <em>below</em> the sprocket holes and the small printed numbers read normally. The top row should then start with a wide bar on the left. If the wide bar is on the right, turn on <button type=\"button\" class=\"inline-button\" data-for=\"mirror-toggle\">Mirror</button>.":
      "拿着胶片，让条码位于齿孔<em>下方</em>，片边的小数字正常可读。这时上排应该从左边的一根宽条开始。如果宽条在右边，请打开<button type=\"button\" class=\"inline-button\" data-for=\"mirror-toggle\">镜像</button>。",
    "Copy the lower row":
      "抄写下排",
    "Click every cell of the lower row where your film has a bar. Drag to fill several. The top row and both ends are identical on every film, so they are already drawn. Older film may have a shorter code with only 7 thin bars in the top row: choose <button type=\"button\" class=\"inline-button\" data-for=\"format-short\">7 thin bars</button> under Layout.":
      "在下排中，你的胶片上有条的每一位都点一下。拖动可一次填满多个位。上排和两端在所有胶片上都相同，所以已经画好了。较旧的胶片可能用较短的编码，上排只有 7 根细条：请在“版式”中选择<button type=\"button\" class=\"inline-button\" data-for=\"format-short\">7 根细条</button>。",
    "Layout":
      "版式",
    "11 thin bars":
      "11 根细条",
    "7 thin bars":
      "7 根细条",
    "Which layout do I have?":
      "我的胶片是哪种版式？",
    "Film":
      "胶片",
    "Color negative":
      "彩色底片",
    "Color":
      "彩色",
    "B&amp;W negative":
      "黑白底片",
    "B&W negative":
      "黑白底片",
    "B&amp;W":
      "黑白",
    "Slide":
      "反转片",
    "What does the film look option do?":
      "“胶片”选项有什么用？",
    "Mirror":
      "镜像",
    "Undo":
      "撤销",
    "Redo":
      "重做",
    "Clear":
      "清除",
    "Count the thin bars in the <strong>top</strong> row between the wide mark at the start and the shorter wide mark at the end. <strong>11 thin bars</strong>: the 31-cell layout with a frame number, introduced around 1990. <strong>7 thin bars</strong>: the original 23-cell layout from 1983, still used on some film in the 1990s; it identifies the film but carries no frame number.":
      "数一数<strong>上排</strong>开头的宽标记和结尾较短的宽标记之间有几根细条。<strong>11 根细条</strong>：带帧号的 31 位版式，约 1990 年推出。<strong>7 根细条</strong>：1983 年最初的 23 位版式，1990 年代仍有部分胶片使用；它能识别胶片，但不含帧号。",
    "This only changes how the strip is drawn, so it is easier to compare with your film. On color and black-and-white negatives the bars are dark. On slide film the edge is black and the bars are clear, because reversal processing turns exposed areas clear: treat the clear marks as bars.":
      "这只改变片条的画法，方便与你的胶片对照。在彩色和黑白底片上，条是深色的。在反转片上，片边是黑的，条是透明的，因为反转冲洗会让曝光过的区域变透明：请把透明的标记当作条。",
    "Find a film’s code":
      "查找胶片的编码",
    "Search by film name, maker or DX number, then put its barcode on the strip to compare it with your film. Results come from the 2008 I3A registry and the community-run Big Film Database.":
      "按胶片名称、生产商或 DX 编号搜索，再把它的条码放到片条上，和你的胶片对照。结果来自 2008 年的 I3A 登记表和由社区维护的 Big Film Database。",
    "Have the cassette?":
      "有暗盒吗？",
    "The six digits printed under the barcode on a 35&nbsp;mm cassette carry the same DX number as the film edge, plus the roll length. Enter them to identify the film.":
      "135 规格暗盒条码下方印的六位数字包含与片边相同的 DX 编号，另加卷长。输入这些数字即可识别胶片。",
    "How the DX edge code works":
      "DX 片边码的原理",
    "Kodak introduced DX encoding in 1983. Besides the checkerboard contacts and barcode on the cassette, every roll carries a <em>latent image</em> barcode exposed along one edge of the film during manufacture. It stays invisible until development, and photofinishing machines read it to recognize the film and, later, to number the frames.":
      "柯达在 1983 年推出了 DX 编码。除了暗盒上的棋盘格触点和条码，每卷胶片在生产时还会沿一侧片边曝光一个<em>潜影</em>条码。它在冲洗前看不见，冲洗设备读取它来识别胶片，后来也用它给各帧编号。",
    "Two tracks":
      "定位码和信息码",
    "The code has two rows that touch. The <strong>clock track</strong> on top, nearest the sprocket holes, is the same on every film: a wide mark, a run of thin bars and a shorter wide mark. Machines use it to find each cell. The <strong>data track</strong> below, along the film edge, holds the information: every cell is either a bar (1) or a gap (0).":
      "编码有两排，彼此紧挨。上面靠近齿孔的是<strong>定位码</strong>，所有胶片都一样：一个宽标记、一串细条和一个较短的宽标记。机器用它找到每一位。下面沿着片边的是<strong>信息码</strong>，承载信息：每一位要么是条（1），要么是空（0）。",
    "Data track, 31-cell layout (the 23-cell layout has cells 1–18 the same, the parity cell at 19 and the stop pattern at 20–23)":
      "信息码，31 位版式（23 位版式的第 1–18 位相同，第 19 位为校验位，第 20–23 位为终止符）",
    "What it holds":
      "内容",
    "<span class=\"swatch swatch--fixed\"></span>Start":
      "<span class=\"swatch swatch--fixed\"></span>起始符",
    "Always <code>101010</code>, under the wide clock mark.":
      "始终为 <code>101010</code>，位于定位码宽标记的下方。",
    "<span class=\"swatch swatch--part1\"></span>Part 1":
      "<span class=\"swatch swatch--part1\"></span>Part 1",
    "Product class, a 7-bit number with weights 64, 32, 16, 8, 4, 2, 1.":
      "型号类别，7 位二进制数，各位的对应数字为 64、32、16、8、4、2、1。",
    "<span class=\"swatch swatch--blank\"></span>Unused":
      "<span class=\"swatch swatch--blank\"></span>未使用",
    "Always empty.":
      "始终为空。",
    "<span class=\"swatch swatch--part2\"></span>Part 2":
      "<span class=\"swatch swatch--part2\"></span>Part 2",
    "Specifier, a 4-bit number with weights 8, 4, 2, 1.":
      "规格号，4 位二进制数，各位的对应数字为 8、4、2、1。",
    "<span class=\"swatch swatch--frame\"></span>Frame":
      "<span class=\"swatch swatch--frame\"></span>帧号",
    "Frame number, a 6-bit number with weights 32 to 1.":
      "帧号，6 位二进制数，对应数字从 32 到 1。",
    "<span class=\"swatch swatch--half\"></span>A":
      "<span class=\"swatch swatch--half\"></span>A",
    "Half-frame flag: a bar means the “A” position between two frames.":
      "半帧标志：有条表示两帧之间的“A”位置。",
    "<span class=\"swatch swatch--parity\"></span>Parity":
      "<span class=\"swatch swatch--parity\"></span>校验位",
    "Set so that cells 7–25 plus this cell hold an even number of bars.":
      "设置成让第 7–25 位加上这一格中的条数为偶数。",
    "<span class=\"swatch swatch--fixed\"></span>Stop":
      "<span class=\"swatch swatch--fixed\"></span>终止符",
    "Always <code>0101</code>, under the shorter clock mark.":
      "始终为 <code>0101</code>，位于定位码较短标记的下方。",
    "The DX number":
      "DX 编号",
    "Part 1 and Part 2 together form the film’s <strong>DX number</strong>, written like <code>79-15</code>. Part 1 numbers were assigned to manufacturers by their industry association (NAPM, then PIMA, then I3A), and each manufacturer used Part 2 to tell its products apart. The cassette carries the same number: the middle four digits of its barcode are 16 × Part 1 + Part 2, so 79-15 becomes 1279.":
      "Part 1 和 Part 2 合起来就是胶片的<strong>DX 编号</strong>，写法如 <code>79-15</code>。Part 1 编号由行业协会（先是 NAPM，后来是 PIMA，再后来是 I3A）分配给各生产商，每个生产商再用 Part 2 区分自己的型号。暗盒上也有同一个编号：暗盒条码中间的四位数字是 16 × Part 1 + Part 2，所以 79-15 变成 1279。",
    "Frame numbers":
      "帧号",
    "The 31-cell layout, patented by Kodak in 1990, adds a frame number. The code is printed twice per frame, once at the frame (<code>23</code>) and once halfway to the next (<code>23A</code>), so a notch punched by a printing machine never removes every code. The number printed just before a barcode, to its left when reading, is the number it carries. Before frame 0, Kodak rolls for example run <code>X</code>, <code>XA</code>, <code>00</code>, <code>00A</code>; in the barcode these are stored as 62 and 63.":
      "31 位版式由柯达在 1990 年取得专利，加入了帧号。编码每帧印两次，一次在该帧处（<code>23</code>），一次在到下一帧的半途（<code>23A</code>），所以印放机打的切口不会把所有编码都破坏掉。紧挨在条码前面（阅读时在它左边）的数字，就是它所带的编号。在第 0 帧之前，例如柯达胶片依次是 <code>X</code>、<code>XA</code>、<code>00</code>、<code>00A</code>；在条码中它们存为 62 和 63。",
    "Printed label and the value in the frame field":
      "片边印字与帧号字段中的值",
    "Printed":
      "片边印字",
    "Frame field":
      "帧号字段",
    "A cell":
      "A 位",
    "Also printed as":
      "也印作",
    "empty / bar":
      "空 / 条",
    "the same number":
      "相同的数字",
    "Edge numbers are exposed at the factory, independently of your camera, so they rarely line up exactly with each picture. Use them to tell frames apart rather than to match your camera’s counter. With a half-frame camera, count positions instead: 0, 0A, 1, 1A … are half frames 0, 1, 2, 3 …":
      "片边数字在工厂里曝光，与你的相机无关，所以很少正好对准每张照片。用它们来区分各帧，而不是去对应相机的计数器。如果用半格相机，请改为数位置：0、0A、1、1A … 就是半帧 0、1、2、3 …",
    "Older film":
      "较旧的胶片",
    "The original code, from before the frame-number extension and still used on some film after it, is shorter: 23 cells, with only 7 thin bars in the top row instead of 11. They carry the film’s DX number but no frame number, so choose <button type=\"button\" class=\"inline-button\" data-for=\"format-short\">7 thin bars</button> under Layout before copying one. If an old code is copied into the 31-cell strip anyway, it still reads as the right film, but with a meaningless frame number (10 or 42); the decoder points this out and offers to switch.":
      "最初的编码出现在加入帧号之前，之后仍有部分胶片使用，它更短：23 位，上排只有 7 根细条，而不是 11 根。它带有胶片的 DX 编号，但没有帧号，所以抄写前请在“版式”中选择<button type=\"button\" class=\"inline-button\" data-for=\"format-short\">7 根细条</button>。如果把旧编码抄进了 31 位的片条，仍能读出正确的胶片，但帧号没有意义（10 或 42）；解码器会指出这一点，并提供切换。",
    "The parity check":
      "奇偶校验",
    "The parity cell is a simple guard against misreading: it holds a bar exactly when Part 1, Part 2, the frame number and the A flag contain an odd number of bars, so the total is always even. When your copy fails the check, one bar is probably wrong. The decoder then lists the single-bar corrections that would give a valid code, starting with known films.":
      "校验位是防止读错的简单保护：当 Part 1、Part 2、帧号和 A 标志中的条数为奇数时，它正好有一根条，所以总数始终为偶数。如果你的抄写没有通过校验，可能有一根条错了。解码器会列出能得到有效编码的单条修正，已知胶片排在前面。",
    "Reading direction and film type":
      "阅读方向与胶片类型",
    "Read the code with the wide clock mark first. When the film is the right way round, usually with its shiny base side toward you, the printed numbers beside the barcode read normally and the wide mark is on the left. Seen from the other side, everything is mirrored. On slide film the edge is black and the bars show as clear marks. Faded or scratched codes are common; since the code repeats every half frame, check the next one along if a bar is unclear.":
      "从定位码的宽标记开始读。胶片方向正确时（通常是光亮的片基面朝向你），条码旁的数字正常可读，宽标记在左边。从另一面看，一切都是镜像的。在反转片上，片边是黑的，条显示为透明的标记。编码褪色或有划痕很常见；由于编码每半帧重复一次，如果某根条看不清，可以看下一个编码。",
    "What the code cannot tell you":
      "编码不能告诉你什么",
    "The DX number names a product. The product name usually includes the speed, but not always. The official list used here dates from 2008, so films introduced later are identified from community reports. Many films are also sold under several names, and the edge code is exposed by the factory that made the film, so one code can belong to a whole family of rebranded films.":
      "DX 编号代表一种型号。型号名称通常带有感光度，但并非总是如此。这里使用的官方列表是 2008 年的，所以较晚推出的胶片要靠社区资料来识别。很多胶片还以多个名称销售，而片边码由生产胶片的工厂曝光，所以一个编码可能对应一整组贴牌胶片。",
    "DX code list":
      "DX 编码列表",
    "The Part 1 numbers and products registered with the International Imaging Industry Association, as published in <cite>DX Codes for 135-Size Film</cite> (February 2008). Select a Part 1 number to filter the list.":
      "在国际影像行业协会（I3A）登记的 Part 1 编号和型号，发表于 <cite>DX Codes for 135-Size Film</cite>（2008 年 2 月）。选择一个 Part 1 编号即可筛选列表。",
    "Sources and credits":
      "来源与致谢",
    "Barcode format":
      "条码格式",
    "Olliver, Johnson &amp; Patton (Eastman Kodak), <a href=\"https://patents.google.com/patent/US4965628A/en\">US patent 4,965,628</a>, “Photographic film with latent image multi-field bar code and eye-readable symbols”, 1990.":
      "Olliver, Johnson &amp; Patton（Eastman Kodak），<a href=\"https://patents.google.com/patent/US4965628A/en\">美国专利 4,965,628</a>，“Photographic film with latent image multi-field bar code and eye-readable symbols”，1990 年。",
    "ISO 1007, <cite>Photography — 135-size film and magazine — Specifications</cite>, section 6, as summarized in Wikipedia’s <a href=\"https://en.wikipedia.org/wiki/DX_number\">DX number</a> and <a href=\"https://en.wikipedia.org/wiki/DX_encoding\">DX encoding</a> articles.":
      "ISO 1007，<cite>Photography — 135-size film and magazine — Specifications</cite>，第 6 节，据英文维基百科 <a href=\"https://en.wikipedia.org/wiki/DX_number\">DX number</a> 和 <a href=\"https://en.wikipedia.org/wiki/DX_encoding\">DX encoding</a> 条目的概述。",
    "Fuji Photo Film, <a href=\"https://patents.google.com/patent/US5122645A/en\">US patent 5,122,645</a>, describing the original layout with seven clock bars.":
      "Fuji Photo Film，<a href=\"https://patents.google.com/patent/US5122645A/en\">美国专利 5,122,645</a>，描述了带七根定位条的最初版式。",
    "The DX Film Edge reader in <a href=\"https://github.com/zxing-cpp/zxing-cpp/blob/master/core/src/oned/ODDXFilmEdgeReader.cpp\">zxing-cpp</a> and the generator in <a href=\"https://github.com/zint/zint/blob/master/backend/dxfilmedge.c\">Zint</a> by Antoine Mérino, used to cross-check every rule on this page; Zint’s test vectors are part of this project’s tests.":
      "Antoine Mérino 为 <a href=\"https://github.com/zxing-cpp/zxing-cpp/blob/master/core/src/oned/ODDXFilmEdgeReader.cpp\">zxing-cpp</a> 编写的 DX Film Edge 读码器和为 <a href=\"https://github.com/zint/zint/blob/master/backend/dxfilmedge.c\">Zint</a> 编写的生成器，用来交叉核对本页的每一条规则；Zint 的测试向量也是本项目测试的一部分。",
    "Antoine Mérino, <a href=\"https://www.merinorus.com/blog/identifying-manufacturer-35-mm-films/\">Identifying the manufacturer of your 35mm (and APS) films</a>, 2024.":
      "Antoine Mérino，<a href=\"https://www.merinorus.com/blog/identifying-manufacturer-35-mm-films/\">Identifying the manufacturer of your 35mm (and APS) films</a>，2024 年。",
    "Aurélien Lawley, <a href=\"https://aurelien.lawley.com.au/posts/decoding_35mm_dx_film_edge_barcodes/\">Decoding 35mm DX film edge barcodes</a>.":
      "Aurélien Lawley，<a href=\"https://aurelien.lawley.com.au/posts/decoding_35mm_dx_film_edge_barcodes/\">Decoding 35mm DX film edge barcodes</a>。",
    "alibosworth, <a href=\"https://github.com/alibosworth/35mm-dx-edge-code/blob/main/readme.md\">DX Latent Edge Code — Format Reference</a>.":
      "alibosworth，<a href=\"https://github.com/alibosworth/35mm-dx-edge-code/blob/main/readme.md\">DX Latent Edge Code — Format Reference</a>。",
    "Film data":
      "胶片数据",
    "International Imaging Industry Association, <cite>DX Codes for 135-Size Film</cite>, February 2008: Part 1 assignments and the product list, transcribed as factual data. <a href=\"https://www.yumpu.com/it/document/view/3454560/dx-codes-for-135-size-film-international-imaging-industry-association\">View the document</a>.":
      "国际影像行业协会（I3A），<cite>DX Codes for 135-Size Film</cite>，2008 年 2 月：Part 1 分配表和型号列表，作为事实数据转录。<a href=\"https://www.yumpu.com/it/document/view/3454560/dx-codes-for-135-size-film-international-imaging-industry-association\">查看文件</a>。",
    "<a href=\"https://github.com/dxdatabase/Open-source-film-database\">The Big Film Database</a> (dxdatabase) © 2018 by Dxdatabase, licensed under <a href=\"https://creativecommons.org/licenses/by-sa/4.0/\">CC BY-SA 4.0</a>. Adapted: only entries with a DX number are kept, the image-name column is removed, “#” search tags are split from names and HTML markup is removed. Thanks also to Antoine Mérino’s <a href=\"https://thebigfilmdatabase.merinorus.com\">modified edition</a>.":
      "<a href=\"https://github.com/dxdatabase/Open-source-film-database\">The Big Film Database</a>（dxdatabase）© 2018 by Dxdatabase，采用 <a href=\"https://creativecommons.org/licenses/by-sa/4.0/\">CC BY-SA 4.0</a> 许可。改编之处：只保留带 DX 编号的条目，删除图片文件名一列，把“#”搜索标签从名称中分开，并删除 HTML 标记。也感谢 Antoine Mérino 的<a href=\"https://thebigfilmdatabase.merinorus.com\">修改版</a>。",
    "This tool":
      "本工具",
    "Free software under the <a href=\"https://www.gnu.org/licenses/gpl-3.0.html\">GNU GPL v3</a>. Source code, tests and data scripts are on <a href=\"https://github.com/ricebucket/dx-film-edge-decoder\">GitHub</a>. Everything runs in your browser: nothing you enter or load, including photos, leaves your device.":
      "采用 <a href=\"https://www.gnu.org/licenses/gpl-3.0.html\">GNU GPL v3</a> 许可的自由软件。源代码、测试和数据脚本都在 <a href=\"https://github.com/ricebucket/dx-film-edge-decoder\">GitHub</a> 上。一切都在你的浏览器中运行：你输入或载入的任何内容（包括照片）都不会离开你的设备。",
    "DX Film Edge Decoder. Film data: I3A registry (2008) and <a href=\"#community-credit\">The Big Film Database</a> (CC BY-SA 4.0). Code: <a href=\"https://github.com/ricebucket/dx-film-edge-decoder\">GPL-3.0 on GitHub</a>.":
      "DX 片边码解码器。胶片数据：I3A 登记表（2008）和 <a href=\"#community-credit\">The Big Film Database</a>（CC BY-SA 4.0）。代码：<a href=\"https://github.com/ricebucket/dx-film-edge-decoder\">GPL-3.0，托管在 GitHub</a>。",
  },
});
