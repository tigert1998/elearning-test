class FileList {
    constructor() {
        this.element = document.getElementById("file-list");

        chrome.storage.local.get('eLearningTestFileList', (result) => {
            let list = result.eLearningTestFileList;
            if (list != null) {
                this.update(list);
            }
        });
    }

    update(list) {
        this.list = list;
        chrome.storage.local.set({ eLearningTestFileList: list });

        let html = "<p>当前题库列表：</p>";
        for (let i = 0; i < list.length; i++) {
            let id = `file-${i}`;
            html += `<div>
<input type="checkbox" id="${id}" name="${id}" ${list[i][1] ? "checked" : ""}/>
<label for="${id}">${list[i][0]}</label>
</div>`;
        }
        this.element.innerHTML = html;

        for (let i = 0; i < list.length; i++) {
            let id = `file-${i}`;
            document.getElementById(id).onclick = () => {
                let list = this.list;
                list[i][1] = !list[i][1];
                this.update(list);
            };
        }
    }
};

let fileList = new FileList();

document.getElementById("update-file-list-btn").onclick = () => {
    chrome.runtime.getPackageDirectoryEntry(root => {
        root.getDirectory('tiku', {}, (directoryEntry) => {
            let reader = directoryEntry.createReader();
            reader.readEntries((entries) => {
                let list = [];
                entries.forEach((entry) => {
                    if (entry.name.match(/\.xlsx?$/i) && !entry.name.startsWith("~$") && !entry.name.startsWith(".~")) {
                        list.push([entry.name, true]);
                    }
                });
                fileList.update(list);
            });
        });
    });
};

let oneClickCompleteBtn = document.getElementById("one-click-complete-btn");

oneClickCompleteBtn.onclick = () => {
    let element = document.getElementById("one-click-complete-result");
    oneClickCompleteBtn.disabled = true;
    element.innerHTML = "<p>自动答题中，请耐心等待。</p>";
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        let tab = tabs[0];
        chrome.tabs.sendMessage(tab.id, "elearning-test-one-click-complete", (response) => {
            if (chrome.runtime.lastError) {
                element.innerHTML = `<p>发送消息时遇到错误：${chrome.runtime.lastError.message}</p><p>请确认是否打开了页面。</p>`;
            } else {
                let html = "";
                if (response.error) {
                    html = `<p>自动答题中遇到错误：${response.error}</p><p>请尝试更新题库列表。</p>`;
                } else {
                    html = `<p>匹配题目数：${response.results.match}</p><p>未匹配题目数：${response.results.notMatch}</p>`;
                }
                element.innerHTML = html;
            }
            oneClickCompleteBtn.disabled = false;
        });
    });
};
