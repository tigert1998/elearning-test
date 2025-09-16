import * as marked from "marked";
import { OneClickCompleteResult, SearchInExcelRow, ServiceWorkerRequestMessage, ServiceWorkerResponseMessage, buildSearchRegex } from "./common";
import { BankItem, toHighlightedHTMLFallback } from "./bank-item";
import renderMathInElement from "../js/katex/contrib/auto-render.min.patched.js";

let getModes = async (): Promise<{ enabled: boolean, secret: boolean, llm: boolean }> => {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get('eLearningTestModes', (result) => {
            let json = result.eLearningTestModes;
            if (json != null) resolve({ enabled: json[0].choice >= 1, secret: json[1].checked, llm: json[0].choice == 2 });
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

let searchBank = (selectedText: string, tooltip: HTMLElement) => {
    tooltip.innerHTML = "<p>正在检索题库中，请耐心等待。</p>";

    let searchTerm = buildSearchRegex(selectedText);
    // emoji is not supported yet
    const regExp = new RegExp(searchTerm, 'gi');

    let request: ServiceWorkerRequestMessage = { bankSearchTerm: searchTerm };
    chrome.runtime.sendMessage(request, undefined, (response: ServiceWorkerResponseMessage) => {
        if (response.error) {
            tooltip.innerHTML = `<p>错误：${response.error}</p><p>您可以尝试点击插件图标，然后点击更新题库列表，并刷新页面。</p>`;
        } else if (response.searchInExcelRows != null) {
            let cellHtmls: string[] = []
            for (let row of response.searchInExcelRows) {
                let bankItem = BankItem.fromHeadersAndValues(row.headers, row.values);
                let html: string | null = null;
                if (bankItem == null) {
                    html = toHighlightedHTMLFallback(row.headers, row.values, regExp);
                } else {
                    html = bankItem.toHighlightedHTML(regExp);
                }
                if (html != null) cellHtmls.push(html);
            }
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
        searchBank(selectedText, tooltip);
    }
});

let tryMatch = (row: SearchInExcelRow, options: string[]) => {
    let bankItem = BankItem.fromHeadersAndValues(row.headers, row.values);
    if (bankItem == null) return null;
    if (Object.entries(bankItem.options).length !== options.length) return null;

    let matches = options.map((option: string): string | null => {
        let regExp = new RegExp(`^${buildSearchRegex(option)}$`, "gi");
        for (let [k, v] of Object.entries(bankItem.options)) {
            if (v.match(regExp)) return k;
        }
        return null;
    });
    if (matches.includes(null)) return null;

    let indices: number[] = [];
    matches.forEach((match, idx) => { if (bankItem.answer.includes(match as string)) indices.push(idx); });
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

    let descElement = question.querySelector(".question-steam > span:last-child") as (HTMLElement | null);
    if (descElement == null) {
        return Promise.reject(new Error("No question description found"));
    }
    let match = descElement.innerText.match(/(.+)（.+）$/);
    if (match == null) {
        return Promise.reject(new Error("Cannot match question scores with regex"));
    }
    let desc = match[1];
    let options: string[] = [];
    for (let e of question.querySelectorAll(".item-details")) {
        let match = (e as HTMLElement).innerText.match(/^[A-Z]\.(.+)/);
        if (match == null) {
            return Promise.reject(new Error("Cannot match options with regex"));
        }
        options.push(match[1]);
    };
    let inputs = question.querySelectorAll("input");
    let link = document.getElementById(`no_${inputs[0].name}`);
    if (link == null) {
        return Promise.reject(new Error("No link element found"));
    }

    let answered = await new Promise((resolve, reject) => {
        let searchTerm = buildSearchRegex(desc);
        let request: ServiceWorkerRequestMessage = { bankSearchTerm: searchTerm };
        chrome.runtime.sendMessage(request, undefined, (response: ServiceWorkerResponseMessage) => {
            if (response.error) {
                reject(new Error(response.error));
            } else if (response.searchInExcelRows != null) {
                let alreadyChecked = false;
                let answered = false;

                for (let row of response.searchInExcelRows) {
                    let indices = tryMatch(row, options);
                    if (indices == null) continue;
                    for (let input of inputs) {
                        alreadyChecked = alreadyChecked || input.checked;
                        input.checked = false;
                    }
                    for (let idx of indices) inputs[idx].checked = true;
                    callback();
                    answered = true;
                    break;
                }

                // update progress
                if (answered && !alreadyChecked) {
                    let numAnswered = parseInt(ansNumElement.innerText) + 1;
                    ansNumElement.innerText = `${numAnswered}`;
                    ansProgressElement.style["width"] = `${100.0 * numAnswered / totalQuestions}%`;
                    link.classList.add("done");
                }

                resolve(answered);
            }
        });
    });

    if (answered) return;

    let questionType = inputs[0].type;
    if (questionType !== "radio" && questionType !== "checkbox") {
        return Promise.reject(new Error(`Invalid question type ${questionType} detected`));
    }

    await new Promise((resolve, reject) => {
        let request: ServiceWorkerRequestMessage = { llmAutoSolve: { type: questionType, problem: desc, options: options } };
        chrome.runtime.sendMessage(request, undefined, (response: ServiceWorkerResponseMessage) => {
            if (response.error) {
                reject(new Error(response.error));
            } else if (response.llmAutoSolveResult != null) {
                console.log(`LLM answered question ${JSON.stringify(request)} with answer ${JSON.stringify(response.llmAutoSolveResult)}`);
                let alreadyChecked = false;
                for (let input of inputs) {
                    alreadyChecked = alreadyChecked || input.checked;
                    input.checked = false;
                }

                for (let idx of response.llmAutoSolveResult) inputs[idx].checked = true;
                callback();

                // update progress
                if (!alreadyChecked) {
                    let numAnswered = parseInt(ansNumElement.innerText) + 1;
                    ansNumElement.innerText = `${numAnswered}`;
                    ansProgressElement.style["width"] = `${100.0 * numAnswered / totalQuestions}%`;
                    link.classList.add("done");
                }

                resolve(true);
            }
        });
    });
}

let oneClickComplete = async (): Promise<OneClickCompleteResult> => {
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
        sendResponse(results);
    })
    return true;
});