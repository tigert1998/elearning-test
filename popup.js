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

document.getElementById("one-click-complete-btn").onclick = () => {
    chrome.tabs.query({}, tabs => {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, "elearning-test-one-click-complete");
        });
    });
};
