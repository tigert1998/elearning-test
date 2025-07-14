// 获取所有文本节点
var textNodes = document.evaluate("//text()", document, null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null);

// 循环遍历所有文本节点，将其设置为可选中和复制
for (var i = 0; i < textNodes.snapshotLength; i++) {
    var node = textNodes.snapshotItem(i);
    // node.parentNode.setAttribute("style", "user-select: text !important");
    node.parentNode.style.userSelect = "text";
}

// 监听鼠标选中事件
document.addEventListener("mouseup", function (event) {
    const selectedText = window.getSelection().toString().trim();
    if (selectedText) {
        // 向后台发送消息，请求处理文本内容
        chrome.runtime.sendMessage({ text: selectedText }, function (response) {
            // 创建结果提示框
            const tooltip = document.createElement("div");
            tooltip.style.position = "absolute";
            tooltip.style.top = event.pageY + "px";
            tooltip.style.left = event.pageX + "px";
            tooltip.style.backgroundColor = "#fff";
            tooltip.style.color = "#000";
            tooltip.style.border = "1px solid #ccc";
            tooltip.style.padding = "5px";
            tooltip.style.zIndex = "9999";

            response.forEach(row => {
                // 创建一行匹配结果
                const resultDiv = document.createElement("div");

                //打印文件、sheet、行号、内容
                // resultDiv.innerText = `文件：${row.file}，Sheet：${row.sheet}，行号：${row.row}，内容：${row.content}`;

                // 高亮显示匹配文本
                const content = row.content;
                const searchTerm = selectedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regExp = new RegExp(searchTerm, 'gi');
                const highlightedContent = content.replace(regExp, `<span class="highlighted-text">$&</span>`);

                //标红答案：
                const resultContent = highlightedContent.replace(/答案/g, `<span class="red-text">$&</span>`);
                resultDiv.innerHTML = `题目：${resultContent}`;

                // 添加匹配结果到结果提示框中
                tooltip.appendChild(resultDiv);
            });

            // 添加结果提示框到页面中
            document.body.appendChild(tooltip);

            // 点击页面其他位置，隐藏结果提示框
            document.addEventListener("mousedown", function (event) {
                const isTooltip = tooltip.contains(event.target);
                if (!isTooltip) {
                    tooltip.remove();
                }
            });
        });
    }
});

