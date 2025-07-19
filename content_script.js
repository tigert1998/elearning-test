// 获取所有文本节点
let textNodes = document.evaluate("//text()", document, null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null);

// 循环遍历所有文本节点，将其设置为可选中和复制
for (let i = 0; i < textNodes.snapshotLength; i++) {
    let node = textNodes.snapshotItem(i);
    node.parentNode.style.userSelect = "text";
}

let tooltips = [];

// 点击页面其他位置，隐藏结果提示框
document.addEventListener("mousedown", (event) => {
    let tooltipsToRemove = tooltips.filter((tooltip) => !tooltip.contains(event.target));
    tooltips = tooltips.filter((tooltip) => tooltip.contains(event.target));
    tooltipsToRemove.forEach((tooltip) => { tooltip.remove(); });
});

let matchAnswerRules = [
    (row) => {
        // 题干    选项A    选项B    选项C    选项D    答案

        let object = Object.fromEntries(row);
        let ans = object["答案"];
        if (ans == null) return null;
        let problem = object["题干"];
        if (problem == null) return null;

        let match = "";
        let text = `【题干】${problem}<br>`;
        for (let [k, v] of row) {
            if (!k.startsWith("选项") || v == null || String(v).trim() === "") continue;
            if (k.length === 3 && ans.includes(k[2])) {
                match += k[2];
                text += `<span class="elearning-test-answer">【${k}】${v}</span>`;
            } else {
                text += `【${k}】${v}`;
            }
            text += "<br>";
        }

        if ((new Set(ans)).size != (new Set(match)).size) return null;

        text += `<span class="elearning-test-answer">【答案】${ans}</span>`;

        return text;
    },
    (row) => {
        // 题干               选项              答案
        // 测试题目的题干     A-选项1|B-选项2     B

        let object = Object.fromEntries(row);
        let ans = object["答案"];
        if (ans == null) return null;
        let options = object["选项"];
        if (options == null) return null;
        let problem = object["题干"];
        if (problem == null) return null;

        let text = `【题干】${problem}<br>`;

        let match = "";
        options.split("|").forEach((opt) => {
            let c = opt.trim()[0];
            if (ans.includes(c)) {
                match += c;
                text += `<span class="elearning-test-answer">${opt}</span>`;
            } else {
                text += opt;
            }
            text += "<br>";
        });
        if ((new Set(ans)).size != (new Set(match)).size) return null;

        text += `<span class="elearning-test-answer">【答案】${ans}</span>`;
        return text;
    },
    (row) => {
        // default
        let text = "";
        for (let [k, v] of row) {
            if (v == null || String(v).trim() === "") continue;
            text += `【${k}】${v}`;
        }
        return text;
    }
];

// 监听鼠标选中事件
document.addEventListener("mouseup", (event) => {
    function constructRowHTML(row, regExp) {
        let text = "";
        for (let func of matchAnswerRules) {
            text = func(row);
            if (text != null) break;
        }

        return text.replace(regExp, `<span class="elearning-test-match">$&</span>`);
    }

    const selectedText = window.getSelection().toString().trim();
    if (selectedText === "") return;
    let searchTerm = selectedText.replace(/\s+/g, "")
        .split('')
        .map(c => c.replace(/[.*+?^${}()|\[\]\\]/g, '\\$&'))
        .join('\\s*');
    // emoji is not supported yet
    const regExp = new RegExp(searchTerm, 'gi');

    // 向后台发送消息，请求处理文本内容
    chrome.runtime.sendMessage({ searchTerm: searchTerm }, (response) => {
        // 创建结果提示框
        const tooltip = document.createElement("div");
        tooltip.className = "elearning-test-tooltip";
        tooltip.style.top = event.pageY + "px";
        tooltip.style.left = event.pageX + "px";

        if (response.error) {
            const div = document.createElement("div");
            div.innerHTML = `<p>错误：${response.error}</p><p>您可以尝试点击插件图标，然后点击更新题库列表，并刷新页面。</p>`;
            tooltip.appendChild(div);
        } else {
            let numColumns = 3;
            let html = "<table>";
            for (let i = 0; i < response.results.length; i += numColumns) {
                html += "<tr>";
                for (let j = i; j < i + numColumns && j < response.results.length; j++) {
                    html += `<td class="elearning-test-table-cell">${constructRowHTML(response.results[j].row, regExp)}</td>`;
                }
                html += "</tr>";
            }
            html += "</table>";
            tooltip.innerHTML = html;
        }

        // 添加结果提示框到页面中
        document.body.appendChild(tooltip);

        tooltips.push(tooltip);
    });
});

