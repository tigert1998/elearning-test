// 获取所有文本节点
let textNodes = document.evaluate("//text()", document, null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null);

// 循环遍历所有文本节点，将其设置为可选中和复制
for (let i = 0; i < textNodes.snapshotLength; i++) {
    let node = textNodes.snapshotItem(i);
    node.parentNode.style.userSelect = "text";
}

// 监听鼠标选中事件
document.addEventListener("mouseup", (event) => {
    function constructRowHTML(row, selectedText) {
        let text = "";
        for (let [k, v] of Object.entries(row)) {
            if (String(v).trim() === "") continue;
            if (k.includes("答案")) {
                text += `<span class="red-text">【${k}】${v}</span>`;
            } else {
                text += `【${k}】${v}`;
            }
        }

        const searchTerm = selectedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regExp = new RegExp(searchTerm, 'gi');
        return text.replace(regExp, `<span class="highlighted-text">$&</span>`);
    }

    const selectedText = window.getSelection().toString().trim();
    if (selectedText) {
        // 向后台发送消息，请求处理文本内容
        chrome.runtime.sendMessage({ text: selectedText }, (response) => {
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

            response.forEach((row) => {
                // 创建一行匹配结果
                const resultDiv = document.createElement("div");
                resultDiv.innerHTML = constructRowHTML(row.row, selectedText);

                // 添加匹配结果到结果提示框中
                tooltip.appendChild(resultDiv);
            });

            // 添加结果提示框到页面中
            document.body.appendChild(tooltip);

            // 点击页面其他位置，隐藏结果提示框
            document.addEventListener("mousedown", (event) => {
                const isTooltip = tooltip.contains(event.target);
                if (!isTooltip) {
                    tooltip.remove();
                }
            });
        });
    }
});

