window.addEventListener("load", (event) => {
    // 禁止阻止右键
    document.oncontextmenu = null;

    // 禁止切屏警告和发送消息至后台
    window.onblur = null;

    // 禁止阻止复制、粘贴、剪切弹窗
    if (typeof $ !== "undefined") {
        $("body").off("copy");
        $("body").off("paste");
        $("body").off("cut");
    }

    // 禁止阻止选中
    document.querySelectorAll("i, label, span, b, p, div").forEach((element) => {
        for (let p of [
            "-moz-user-select",
            "-webkit-user-select",
            "-ms-user-select",
            "-khtml-user-select",
            "-o-user-select",
            "user-select"
        ]) {
            element.style[p] = "text";
        }
    });
});