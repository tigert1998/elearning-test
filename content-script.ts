import * as marked from "marked";
import renderMathInElement from "./katex/contrib/auto-render.min.patched.js";

let constructSearchRegex = (text: string): string => {
    return text.replace(/\s+/g, "")
        .split('')
        .map(c => c.replace(/[.*+?^${}()|\[\]\\]/g, '\\$&'))
        .join('\\s*');
};

let isSubsetOf = (x: Set<string>, y: Set<string>) => {
    for (let k of x.keys()) {
        if (!y.has(k)) return false;
    }
    return true;
};

let findKeys = (row: any[][], substr: string) => {
    let ks: string[] = [];
    for (let [k, v] of row) {
        if (k.includes(substr)) ks.push(k);
    }
    return ks;
};

type ParseAnswerRuleResult = string | {
    "problem": string,
    "answer": string,
    "options": { [key: string]: string }
};

let parseAnswerRules = [
    (row: any[][]) => {
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

        let obj: { "problem": string, "answer": string, "options": { [key: string]: string } } =
            { "problem": String(problem), "answer": String(ans).trim(), "options": {} };
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
    (row: any[][]) => {
        // 题干               选项              答案
        // 测试题目的题干     A-选项1|B-选项2     B

        let ansKey = findKeys(row, "答案");
        if (ansKey.length !== 1) return null;
        let problemKey = findKeys(row, "题干");
        if (problemKey.length !== 1) return null;

        let object = Object.fromEntries(row);
        let ans = object[ansKey[0]];
        if (ans == null) return null;
        let options: string = object["选项"];
        if (options == null) return null;
        let problem = object[problemKey[0]];
        if (problem == null) return null;

        let obj: { "problem": string, "answer": string, "options": { [key: string]: string } }
            = { "problem": String(problem), "answer": String(ans).trim(), "options": {} };

        options.split("|").forEach((opt) => {
            let c = opt.trim()[0];
            obj["options"][c] = opt.trim().substring(2).trim();
        });
        if (!isSubsetOf(new Set(obj["answer"]), new Set(Object.keys(obj["options"])))) return null;

        return obj;
    },
    (row: any[][]) => {
        // default
        let text = "";
        for (let [k, v] of row) {
            if (v == null || String(v).trim() === "") continue;
            text += `【${k}】${v}`;
        }
        return text;
    }
];

let parseAnswer = (result: { headers: string[], cells: any[] }): ParseAnswerRuleResult => {
    let row = result.headers.map((header, index) => [header, result.cells[index]]);
    for (let func of parseAnswerRules) {
        let obj = func(row);
        if (obj != null) return obj;
    }
    throw new Error(`Cannot parse answer result: ${result}`)
};

let getModes = async (): Promise<{ enabled: boolean, secret: boolean, llm: boolean }> => {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get('eLearningTestModes', (result) => {
            let json = result.eLearningTestModes;
            if (json != null) resolve({ enabled: json[0].choice >= 1, secret: json[1][1], llm: json[0].choice == 2 });
            else resolve({ enabled: true, secret: false, llm: false });
        })
    });
};

document.addEventListener("click", async (event) => {
    let target = event.target as HTMLElement;
    if (!target.classList.contains("num")) return;
    let parent = target.parentNode as HTMLElement;
    if (!parent.classList.contains("question-steam")) return;
    let question = parent.parentNode as HTMLElement;
    if (!question.classList.contains("question-panel-middle")) return;

    try {
        await fillInQuestion(question, () => { });
    } catch (e) {
        console.warn(`Can't fill in question because an error is throwed: ${(e as Error).stack}`);
    }
});

let tooltips: HTMLElement[] = [];

// 点击页面其他位置，隐藏结果提示框
document.addEventListener("mousedown", (event) => {
    let tooltipsToRemove = tooltips.filter((tooltip) => !tooltip.contains(event.target as HTMLElement));
    tooltips = tooltips.filter((tooltip) => tooltip.contains(event.target as HTMLElement));
    tooltipsToRemove.forEach((tooltip) => { tooltip.remove(); });
});

let buildQuestionHTML = (obj: ParseAnswerRuleResult, regExp: RegExp) => {
    let text = "";

    let valid = false;
    let matchRegExp = (text: string) => {
        if (text.match(regExp)) {
            valid = true;
            return text.replace(regExp, `<span class="elearning-test-match">$&</span>`);
        } else {
            return text;
        }
    };

    if (typeof obj === "string") text = matchRegExp(obj);
    else {
        text = `【题干】${matchRegExp(obj["problem"])}<br>`;
        for (let [k, v] of Object.entries(obj["options"])) {
            let line = `【选项${k}】${matchRegExp(v)}`;
            if (obj["answer"].includes(k)) {
                text += `<span class="elearning-test-answer">${line}</span><br>`;
            } else {
                text += `${line}<br>`;
            }
        }
        text += `【答案】${matchRegExp(obj["answer"])}`;
    }

    if (valid) return text;
    return null;
}

// TODO
type SearchInExcelRow = {
    rowIndex: number,
    headers: string[],
    cells: any[],
    file: string,
    sheet: string,
};

let searchQuestions = (selectedText: string, tooltip: HTMLElement) => {
    tooltip.innerHTML = "<p>正在检索题库中，请耐心等待。</p>";

    let searchTerm = constructSearchRegex(selectedText);
    // emoji is not supported yet
    const regExp = new RegExp(searchTerm, 'gi');

    interface Response {
        results: SearchInExcelRow[],
        error: null | string
    };
    // 向后台发送消息，请求处理文本内容
    chrome.runtime.sendMessage({ searchTerm: searchTerm }, undefined, (response: Response) => {
        if (response.error) {
            tooltip.innerHTML = `<p>错误：${response.error}</p><p>您可以尝试点击插件图标，然后点击更新题库列表，并刷新页面。</p>`;
        } else {
            let cellHtmls = response.results
                .map((result) => buildQuestionHTML(parseAnswer(result), regExp))
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
    thinkOpened: boolean;
    root: HTMLElement;
    toggle: HTMLElement;
    think: HTMLElement;
    answer: HTMLElement;

    constructor() {
        this.thinkOpened = true;
        this.root = document.createElement("div");
        this.root.innerHTML = `<button class="elearning-test-llm-toggle"></button>
<div class="elearning-test-llm-think"></div>
<div class="elearning-test-llm-answer"></div>`;
        this.toggle = this.root.querySelector("button") as HTMLElement;
        this.think = this.root.querySelector(".elearning-test-llm-think") as HTMLElement;
        this.answer = this.root.querySelector(".elearning-test-llm-answer") as HTMLElement;

        this.think.style.display = this.thinkOpened ? "block" : "none";
        this.toggle.innerText = this.thinkOpened ? "折叠思考过程" : "展开思考过程";
        this.toggle.onclick = () => {
            this.think.style.display = this.thinkOpened ? "none" : "block";
            this.toggle.innerText = this.thinkOpened ? "展开思考过程" : "折叠思考过程";
            this.thinkOpened = !this.thinkOpened;
        };
    }

    static renderMarkdownAndMath(e: HTMLElement, text: string) {
        let decodeHTML = (html: string) => {
            let e = document.createElement("textarea");
            e.innerHTML = html;
            return e.value;
        };

        e.innerHTML = text;
        renderMathInElement(e, {
            throwOnError: false,
            delimiters: [
                { left: "$$", right: "$$", display: true },
                { left: "$", right: "$", display: false },
                { left: "\\(", right: "\\)", display: false },
                { left: "\\begin{equation}", right: "\\end{equation}", display: true },
                { left: "\\begin{align}", right: "\\end{align}", display: true },
                { left: "\\begin{alignat}", right: "\\end{alignat}", display: true },
                { left: "\\begin{gather}", right: "\\end{gather}", display: true },
                { left: "\\begin{CD}", right: "\\end{CD}", display: true },
                { left: "\\[", right: "\\]", display: true }
            ]
        });
        e.innerHTML = marked.parse(decodeHTML(e.innerHTML)) as string;
    }

    set reasoningContent(text: string) {
        if (text.trim().length > 0) {
            this.toggle.style.display = "block";
            this.think.style.display = this.thinkOpened ? "block" : "none";
            LLMAnswerCard.renderMarkdownAndMath(this.think, text);
        } else {
            this.toggle.style.display = "none";
            this.think.style.display = "none";
            this.think.innerHTML = "";
        }
    }

    set content(text: string) {
        LLMAnswerCard.renderMarkdownAndMath(this.answer, text);
    }
};

let askLLM = (selectedText: string, tooltip: HTMLElement) => {
    tooltip.innerHTML = "<p>正在查询LLM中，请耐心等待。</p>";

    let port = chrome.runtime.connect(undefined, { name: "llm" });
    let llmAnswerCard = new LLMAnswerCard();
    port.postMessage({ text: selectedText });
    port.onMessage.addListener((response) => {
        if (response.error) {
            let div = document.createElement("div");
            div.innerHTML = `<p>错误：${response.error}</p><p>请检查llm-config.json中的配置是否正确，请检查网络连接是否正常。</p>`;
            if (tooltip.contains(llmAnswerCard.root)) tooltip.appendChild(div);
            else tooltip.replaceChildren(div);
        } else {
            if (!tooltip.contains(llmAnswerCard.root)) tooltip.replaceChildren(llmAnswerCard.root);
            llmAnswerCard.reasoningContent = response.reasoningContent;
            llmAnswerCard.content = response.content;
        }
    });
};

document.addEventListener("mouseup", async (event) => {
    if (tooltips.some((tooltip) => tooltip.contains(event.target as HTMLElement))) return;
    let selectedText = await new Promise(resolve => {
        setTimeout(() => {
            let selection = window.getSelection();
            if (selection == null) resolve("");
            else resolve(selection.toString().trim());
        }, 0);
    }) as string;
    if (selectedText === "") return;

    let modes = await getModes();
    if (!modes.enabled) return;

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

let tryMatch = (answerRow: { headers: string[], cells: any[] }, options: string[]) => {
    let obj = parseAnswer(answerRow);
    if (obj == null || typeof obj === "string") return null;
    if (Object.entries(obj["options"]).length !== options.length) return null;

    let matches = options.map((option: string): string | null => {
        let regExp = new RegExp(`^${constructSearchRegex(option)}$`, "gi");
        for (let [k, v] of Object.entries(obj["options"])) {
            if (v.match(regExp)) return k;
        }
        return null;
    });
    if (matches.includes(null)) return null;

    let indices: number[] = [];
    matches.forEach((match, idx) => { if (obj["answer"].includes(match as string)) indices.push(idx); });
    return indices;
};

let fillInQuestion = async (question: HTMLElement, callback: () => void) => {
    let ansNumElements = document.getElementsByClassName("has-answer-num");
    let totalElements = document.getElementsByClassName("total-answer-num");
    let ansProgressElements = document.getElementsByClassName("answer-progress");
    if (ansNumElements.length <= 0 || ansProgressElements.length <= 0 || totalElements.length <= 0)
        throw new Error("Progress bar is not found");
    let ansNumElement = ansNumElements[0] as HTMLElement;
    let ansProgressElement = ansProgressElements[0] as HTMLElement;
    let totalQuestions = parseInt((totalElements[0] as HTMLElement).innerText);

    await new Promise((resolve, reject) => {
        let descElement = question.querySelector(".question-steam > span:last-child") as (HTMLElement | null);
        if (descElement == null) {
            reject(new Error("No question description found"));
            return;
        }
        let match = descElement.innerText.match(/(.+)（.+）$/);
        if (match == null) {
            reject(new Error("Cannot match question scores with regex"));
            return;
        }
        let desc = match[1];
        let options: string[] = [];
        for (let e of question.querySelectorAll(".item-details")) {
            let match = (e as HTMLElement).innerText.match(/^[A-Z]\.(.+)/);
            if (match == null) {
                reject(new Error("Cannot match options with regex"));
                return;
            }
            options.push(match[1]);
        };
        let inputs = question.querySelectorAll("input");
        let link = document.getElementById(`no_${inputs[0].name}`);
        if (link == null) {
            reject(new Error("No link element found"));
            return;
        }

        let searchTerm = constructSearchRegex(desc);

        chrome.runtime.sendMessage({ searchTerm: searchTerm }, undefined, (response) => {
            if (response.error) {
                reject(new Error(response.error));
            } else {
                let alreadyChecked = false;

                for (let result of response.results) {
                    let indices = tryMatch(result, options);
                    if (indices == null) continue;
                    for (let input of inputs) {
                        alreadyChecked = alreadyChecked || input.checked;
                        input.checked = false;
                    }
                    for (let idx of indices) inputs[idx].checked = true;
                    callback();
                    break;
                }

                // update progress
                for (let input of inputs) if (input.checked) {
                    let numAnswered = parseInt(ansNumElement.innerText) + (alreadyChecked ? 0 : 1);
                    ansNumElement.innerText = `${numAnswered}`;
                    ansProgressElement.style["width"] = `${100.0 * numAnswered / totalQuestions}%`;
                    link.classList.add("done");
                    break;
                }

                resolve(null);
            }
        });
    });
}

let oneClickComplete = async () => {
    let questions = document.getElementsByClassName("question-panel-middle");

    let promises: Promise<void>[] = [];
    let match = 0;

    let ansNumElement = document.getElementsByClassName("has-answer-num");
    let ansProgressElement = document.getElementsByClassName("answer-progress");
    if (ansNumElement.length <= 0 || ansProgressElement.length <= 0) return {
        match: 0,
        notMatch: 0,
        errors: []
    };

    for (let question of questions) {
        promises.push(fillInQuestion(question as HTMLElement, () => { match += 1; }));
    };

    let results = await Promise.allSettled(promises);
    let errors: { index: number, reason: string }[] = [];
    results.forEach((result, index) => {
        if (result.status === "rejected") {
            errors.push({ index, reason: result.reason.stack });
        }
    });

    return {
        match: match,
        notMatch: questions.length - match,
        errors: errors
    };
};

chrome.runtime.onMessage.addListener((request: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    if (request !== "elearning-test-one-click-complete") return false;
    oneClickComplete().then((results) => {
        sendResponse({ results: results });
    })
    return true;
});