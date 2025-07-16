importScripts("suffixer.js");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    searchInExcel(request.text).then(result => {
        sendResponse(result);
    }).catch(error => {
        console.error('Fail to search: ', error);
        sendResponse([]);
    });
    return true; // 保持连接开放以支持异步响应
});

async function searchInExcel(text) {
    let result = await chrome.storage.local.get(["rows", "treeJSON", "cellRowID"]);
    let tree = Suffixer.deserialize(result.treeJSON);

    let cellIDs = tree.includes(
        text.replace(/\s+/g, "").toLowerCase(),
        { returnStrings: false }
    ).map((pair) => pair[0]);

    let rows = cellIDs.map((cellID) => {
        let rowIndex = result.cellRowID[cellID];
        return result.rows[rowIndex];
    });

    return rows;
}
