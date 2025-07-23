document.getElementById("update-file-list-btn").onclick = () => {
    function constructFileListHTML(fileList) {
        let ret = "<p>搜索到题库列表：</p><ul>";
        for (let i = 0; i < fileList.length; i++) {
            ret += `<li>${fileList[i]}</li>`;
        }
        ret += "</ul>";
        return ret;
    }

    chrome.runtime.getPackageDirectoryEntry(root => {
        root.getDirectory('tiku', {}, (directoryEntry) => {
            let reader = directoryEntry.createReader();
            reader.readEntries((entries) => {
                let fileList = [];
                entries.forEach((entry) => {
                    if (entry.name.match(/\.xlsx?$/i) && !entry.name.startsWith("~$") && !entry.name.startsWith(".~")) {
                        fileList.push(entry.name);
                    }
                });
                let element = document.getElementById("file-list");
                element.innerHTML = constructFileListHTML(fileList);
                chrome.storage.local.set({ eLearningTestFileList: fileList });
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
        chrome.tabs.sendMessage(tab.id, "elearning-test-one-click-complete").then((response) => {
            let html = "";
            if (response.error) {
                html = `<p>自动答题中遇到错误：${response.error}</p><p>请尝试更新题库列表。</p>`;
            } else {
                html = `<p>匹配题目数：${response.results.match}</p><p>未匹配题目数：${response.results.notMatch}</p>`;
            }
            element.innerHTML = html;
            oneClickCompleteBtn.disabled = false;
        });
    });
};
