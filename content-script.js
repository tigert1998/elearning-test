let constructSearchRegex = (text) => {
    return text.replace(/\s+/g, "")
        .split('')
        .map(c => c.replace(/[.*+?^${}()|\[\]\\]/g, '\\$&'))
        .join('\\s*');
};

let isSubsetOf = (x, y) => {
    for (let k of x.keys()) {
        if (!y.has(k)) return false;
    }
    return true;
};

let findKeys = (row, substr) => {
    let ks = [];
    for (let [k, v] of row) {
        if (k.includes(substr)) ks.push(k);
    }
    return ks;
};

let parseAnswerRules = [
    (row) => {
        // 题干    选项A    选项B    选项C    选项D    答案

        let ansKey = findKeys(row, "答案");
        if (ansKey.length !== 1) return null;
        let problemKey = findKeys(row, "题干");
        if (problemKey.length !== 1) return null;

        let object = Object.fromEntries(row);
        let ans = object[ansKey[0]];
        if (ans == null) return null;
        let problem = object[problemKey[0]];
        if (problem == null) return null;

        let obj = { "problem": String(problem), "answer": String(ans).trim(), "options": {} };
        for (let [k, v] of row) {
            if (!k.startsWith("选项") || k.length <= 2 || v == null || String(v).trim() === "") continue;
            obj["options"][k.substring(2).trim()] = String(v).trim();
        }
        if (!isSubsetOf(new Set(obj["answer"]), new Set(Object.keys(obj["options"])))) {
            let regex = new RegExp(constructSearchRegex(obj["answer"]), "gi");
            for (let [k, v] of Object.entries(obj["options"])) {
                if (v.match(regex)) {
                    obj["answer"] = k;
                    return obj;
                }
            }
            return null;
        }

        return obj;
    },
    (row) => {
        // 题干               选项              答案
        // 测试题目的题干     A-选项1|B-选项2     B

        let ansKey = findKeys(row, "答案");
        if (ansKey.length !== 1) return null;
        let problemKey = findKeys(row, "题干");
        if (problemKey.length !== 1) return null;

        let object = Object.fromEntries(row);
        let ans = object[ansKey[0]];
        if (ans == null) return null;
        let options = object["选项"];
        if (options == null) return null;
        let problem = object[problemKey[0]];
        if (problem == null) return null;

        let obj = { "problem": String(problem), "answer": String(ans).trim(), "options": {} };

        options.split("|").forEach((opt) => {
            let c = opt.trim()[0];
            obj["options"][c] = opt.trim().substring(2).trim();
        });
        if (!isSubsetOf(new Set(obj["answer"]), new Set(Object.keys(obj["options"])))) return null;

        return obj;
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

let parseAnswer = (row) => {
    for (let func of parseAnswerRules) {
        let obj = func(row);
        if (obj != null) return obj;
    }
};

let getModes = async () => {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get('eLearningTestModes', (result) => {
            let json = result.eLearningTestModes;
            if (json != null) resolve({ secret: json[0][1], llm: json[1][1] });
            else resolve({ secret: false, llm: false });
        })
    });
};

let tooltips = [];

// 点击页面其他位置，隐藏结果提示框
document.addEventListener("mousedown", (event) => {
    let tooltipsToRemove = tooltips.filter((tooltip) => !tooltip.contains(event.target));
    tooltips = tooltips.filter((tooltip) => tooltip.contains(event.target));
    tooltipsToRemove.forEach((tooltip) => { tooltip.remove(); });
});

let buildQuestionHTML = (obj, regExp) => {
    let text = "";

    if (typeof obj === "string") text = obj;
    else {
        text = `【题干】${obj["problem"]}<br>`;
        for (let [k, v] of Object.entries(obj["options"])) {
            let line = `【选项${k}】${v}`;
            if (obj["answer"].includes(k)) {
                text += `<span class="elearning-test-answer">${line}</span><br>`;
            } else {
                text += `${line}<br>`;
            }
        }
        text += `【答案】${obj["answer"]}`;
    }

    if (text.match(regExp))
        return text.replace(regExp, `<span class="elearning-test-match">$&</span>`);
    else return null;
}

let searchQuestions = (selectedText, tooltip) => {
    tooltip.innerHTML = "<p>正在检索题库中，请耐心等待。</p>";

    let searchTerm = constructSearchRegex(selectedText);
    // emoji is not supported yet
    const regExp = new RegExp(searchTerm, 'gi');

    // 向后台发送消息，请求处理文本内容
    chrome.runtime.sendMessage({ searchTerm: searchTerm }, (response) => {
        if (response.error) {
            tooltip.innerHTML = `<p>错误：${response.error}</p><p>您可以尝试点击插件图标，然后点击更新题库列表，并刷新页面。</p>`;
        } else {
            let cellHtmls = response.results
                .map((result) => buildQuestionHTML(parseAnswer(result.row), regExp))
                .filter((html) => html != null);

            let numColumns = 3;
            let html = "<table>";
            for (let i = 0; i < cellHtmls.length; i += numColumns) {
                html += "<tr>";
                for (let j = i; j < i + numColumns && j < cellHtmls.length; j++) {
                    html += `<td class="elearning-test-table-cell">${cellHtmls[j]}</td>`;
                }
                html += "</tr>";
            }
            html += "</table>";
            tooltip.innerHTML = html;
        }
    });
};

// web component is not allowed in content script
class LLMAnswerCard {
    constructor() {
        this.thinkOpened = true;
        this.root = document.createElement("div");
        this.root.innerHTML = `<button class="elearning-test-llm-toggle"></button>
<div class="elearning-test-llm-think"></div>
<div class="elearning-test-llm-answer"></div>`;

        this.toggle = this.root.querySelector("button");
        this.think = this.root.querySelector(".elearning-test-llm-think");
        this.answer = this.root.querySelector(".elearning-test-llm-answer");

        this.think.style.display = this.thinkOpened ? "block" : "none";
        this.toggle.innerText = this.thinkOpened ? "折叠思考过程" : "展开思考过程";
        this.toggle.onclick = () => {
            this.think.style.display = this.thinkOpened ? "none" : "block";
            this.toggle.innerText = this.thinkOpened ? "展开思考过程" : "折叠思考过程";
            this.thinkOpened = !this.thinkOpened;
        };
    }

    static renderMarkdownAndMath(e, text) {
        e.innerHTML = text;
        renderMathInElement(e, { throwOnError: false });
        e.innerHTML = marked.parse(e.innerHTML);
    }

    set reasoningContent(text) {
        if (text.length > 0) {
            this.toggle.style.display = "block";
            LLMAnswerCard.renderMarkdownAndMath(this.think, text);
        } else {
            this.toggle.style.display = "none";
            this.think.innerHTML = "";
        }
    }

    set content(text) {
        LLMAnswerCard.renderMarkdownAndMath(this.answer, text);
    }
};

let askLLM = (selectedText, tooltip) => {
    tooltip.innerHTML = "<p>正在查询LLM中，请耐心等待。</p>";

    let port = chrome.runtime.connect({ name: "llm" });
    let reasoningContent = "";
    let content = "";
    let llmAnswerCard = new LLMAnswerCard();
    let cardAttached = false;
    port.postMessage({ text: selectedText });
    port.onMessage.addListener((response) => {
        if (response.error) {
            let html = `<p>错误：${response.error}</p><p>请检查llm-config.json中的配置是否正确，请检查网络连接是否正常。</p>`;
            if (cardAttached) tooltip.innerHTML += html;
            else tooltip.innerHTML = html;
        } else {
            reasoningContent += response.reasoningContent;
            content += response.content;
            if (!cardAttached) {
                cardAttached = true;
                tooltip.replaceChildren(llmAnswerCard.root);
            }
            llmAnswerCard.reasoningContent = reasoningContent;
            llmAnswerCard.content = content;
        }
    });
};

document.addEventListener("mouseup", async (event) => {
    if (tooltips.some((tooltip) => tooltip.contains(event.target))) return;
    let selectedText = await new Promise(resolve => {
        setTimeout(() => {
            resolve(window.getSelection().toString().trim());
        }, 0);
    });
    if (selectedText === "") return;

    let modes = await getModes();
    const tooltip = document.createElement("div");
    tooltip.className = "elearning-test-tooltip";
    tooltip.style.top = event.pageY + "px";
    tooltip.style.left = event.pageX + "px";
    if (modes.secret) tooltip.style.opacity = "0.33";
    document.body.appendChild(tooltip);
    tooltips.push(tooltip);

    if (modes.llm) {
        askLLM(selectedText, tooltip);
    } else {
        searchQuestions(selectedText, tooltip);
    }
});

let tryMatch = (answerRow, options) => {
    let obj = parseAnswer(answerRow);
    if (obj == null || typeof obj === "string") return null;
    if (Object.entries(obj["options"]).length !== options.length) return null;

    let matches = options.map((option) => {
        let regExp = new RegExp(`^${constructSearchRegex(option)}$`, "gi");
        for (let [k, v] of Object.entries(obj["options"])) {
            if (v.match(regExp)) return k;
        }
        return null;
    });
    if (matches.includes(null)) return null;

    let indices = [];
    matches.forEach((match, idx) => { if (obj["answer"].includes(match)) indices.push(idx); });
    return indices;
};

let oneClickComplete = async () => {
    let questions = document.getElementsByClassName("question-panel-middle");

    let promises = [];
    let match = 0;
    let numAnswered = 0;

    let ansNumElement = document.getElementsByClassName("has-answer-num");
    let ansProgressElement = document.getElementsByClassName("answer-progress");
    if (ansNumElement.length <= 0 || ansProgressElement.length <= 0) return {
        match: 0,
        notMatch: 0
    };
    ansNumElement = ansNumElement[0];
    ansProgressElement = ansProgressElement[0];

    for (let question of questions) {
        let desc = question.querySelector(".question-steam > span:last-child").innerText.match(/(.+)（.+）$/)[1];
        let options = [];
        for (let e of question.querySelectorAll(".item-details")) {
            options.push(e.innerText.match(/^[A-Z]\.(.+)/)[1]);
        };
        let inputs = question.querySelectorAll("input");
        let link = document.getElementById(`no_${inputs[0].name}`);

        let searchTerm = constructSearchRegex(desc);
        let promise = new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ searchTerm: searchTerm }, (response) => {
                if (response.error) {
                    reject(response.error);
                } else {
                    for (let result of response.results) {
                        let indices = tryMatch(result.row, options);
                        if (indices == null) continue;
                        match += 1;
                        for (let input of inputs) input.checked = false;
                        for (let idx of indices) inputs[idx].checked = true;
                        break;
                    }

                    // update progress
                    for (let input of inputs) if (input.checked) {
                        numAnswered += 1;
                        ansNumElement.innerText = `${numAnswered}`;
                        ansProgressElement.style["width"] = `${100.0 * numAnswered / questions.length}%`;
                        link.classList.add("done");
                        break;
                    }

                    resolve();
                }
            });
        });
        promises.push(promise);
    };

    await Promise.all(promises);

    return {
        match: match,
        notMatch: questions.length - match
    };
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request !== "elearning-test-one-click-complete") return false;
    oneClickComplete().then((results) => {
        sendResponse({ results: results, error: null });
    }).catch((error) => {
        sendResponse({ results: null, error: error });
    });
    return true;
});