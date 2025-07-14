importScripts('xlsx.full.min.js'); // 确保在项目中包含XLSX库

// 监听来自content_script.js的消息
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    searchInExcel(request.text).then(result => {
        sendResponse(result);
    }).catch(error => {
        console.error('搜索失败:', error);
        sendResponse([]);
    });
    return true; // 保持连接开放以支持异步响应
});

async function searchInExcel(searchText) {
    const results = [];

    try {
        // 获取文件列表
        const fileList = await getFileList();

        // 并行处理所有Excel文件
        await Promise.all(fileList.map(async file => {
            try {
                const fileUrl = chrome.runtime.getURL(`tiku/${file}`);
                const response = await fetch(fileUrl);

                if (!response.ok) throw new Error(`文件加载失败: ${file}`);

                const arrayBuffer = await response.arrayBuffer();
                const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });

                // 遍历所有工作表
                workbook.SheetNames.forEach(sheetName => {
                    const worksheet = workbook.Sheets[sheetName];
                    const sheetData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                    // 搜索匹配的行
                    sheetData.forEach((row, rowIndex) => {
                        const rowText = row.join(',');
                        if (row.some(cell => String(cell).includes(searchText))) {
                            results.push({
                                row: rowIndex + 1,
                                content: rowText,
                                file: file,
                                sheet: sheetName
                            });
                        }
                    });
                });
            } catch (error) {
                console.error(`处理文件 ${file} 时出错:`, error);
            }
        }));
    } catch (error) {
        console.error('获取文件列表失败:', error);
    }

    return results;
}

async function getFileList() {
    const response = await fetch(chrome.runtime.getURL('tiku_manifest.json'));
    const fileList = await response.json();
    return fileList;
}