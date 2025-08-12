import re

if __name__ == "__main__":
    with open("katex/katex.min.css", "r") as f:
        content = f.read()
    content = re.sub(
        "url\\(fonts/KaTeX_",
        "url(chrome-extension://__MSG_@@extension_id__/katex/fonts/KaTeX_",
        content,
    )
    with open("katex/katex.min.patched.css", "w") as f:
        f.write(content)
