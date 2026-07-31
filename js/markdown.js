/**
 * Markdown 渲染
 * -------------------------------------------------------------
 * 1. 优先使用 CDN 的 marked；
 * 2. CDN 挂掉/解析异常时自动回落到内置的应急 Markdown 渲染器；
 * 3. 渲染后统一处理 GitHub Alerts（[!NOTE] / [!TIP] / [!IMPORTANT] /
 *    [!WARNING] / [!CAUTION]），转换为带样式的提示块。
 */
window.ICC = window.ICC || {};

(function (ICC) {
    "use strict";

    var ALERT_TYPES = {
        NOTE: { cls: "note", icon: "info", title: "注意" },
        TIP: { cls: "tip", icon: "lightbulb", title: "提示" },
        IMPORTANT: { cls: "important", icon: "priority_high", title: "重要" },
        WARNING: { cls: "warning", icon: "warning", title: "警告" },
        CAUTION: { cls: "caution", icon: "dangerous", title: "危险" }
    };

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    // ---------- 应急 Markdown 渲染器（marked 不可用时使用） ----------
    function renderInline(text) {
        var out = escapeHtml(text);

        // 行内代码（先处理，避免内部符号被二次解析）
        var codes = [];
        out = out.replace(/`([^`]+)`/g, function (m, code) {
            codes.push(code);
            return "\u0000CODE" + (codes.length - 1) + "\u0000";
        });

        // 图片 / 链接
        out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, '<img src="$2" alt="$1">');
        out = out.replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
        // 裸链接
        out = out.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');

        // 强调
        out = out.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
        out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
        out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
        out = out.replace(/~~([^~]+)~~/g, "<del>$1</del>");

        // 还原行内代码
        out = out.replace(/\u0000CODE(\d+)\u0000/g, function (m, i) {
            return "<code>" + escapeHtml(codes[Number(i)]) + "</code>";
        });

        return out;
    }

    function fallbackMarkdown(src) {
        var lines = String(src).replace(/\r\n/g, "\n").split("\n");
        var html = [];
        var listStack = [];   // 'ul' | 'ol'
        var inCode = false;
        var codeBuffer = [];
        var quoteBuffer = null;

        function closeLists() {
            while (listStack.length) html.push("</" + listStack.pop() + ">");
        }
        function flushQuote() {
            if (quoteBuffer !== null) {
                html.push("<blockquote>" + fallbackMarkdown(quoteBuffer.join("\n")) + "</blockquote>");
                quoteBuffer = null;
            }
        }

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];

            // 代码块
            if (/^\s*```/.test(line)) {
                if (inCode) {
                    html.push("<pre><code>" + escapeHtml(codeBuffer.join("\n")) + "</code></pre>");
                    codeBuffer = [];
                    inCode = false;
                } else {
                    closeLists();
                    flushQuote();
                    inCode = true;
                }
                continue;
            }
            if (inCode) { codeBuffer.push(line); continue; }

            // 引用（含 GitHub Alert，交由后续 enhance 处理）
            var quoteMatch = line.match(/^\s*>\s?(.*)$/);
            if (quoteMatch) {
                closeLists();
                if (quoteBuffer === null) quoteBuffer = [];
                quoteBuffer.push(quoteMatch[1]);
                continue;
            }
            flushQuote();

            // 空行
            if (!line.trim()) { closeLists(); continue; }

            // 分割线
            if (/^\s*([-*_])\s*\1\s*\1[\s\S]*$/.test(line) && !/[^\s\-*_]/.test(line)) {
                closeLists();
                html.push("<hr>");
                continue;
            }

            // 标题
            var heading = line.match(/^(#{1,6})\s+(.*)$/);
            if (heading) {
                closeLists();
                var level = heading[1].length;
                html.push("<h" + level + ">" + renderInline(heading[2]) + "</h" + level + ">");
                continue;
            }

            // 列表
            var ul = line.match(/^\s*[-*+]\s+(.*)$/);
            var ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
            if (ul || ol) {
                var tag = ul ? "ul" : "ol";
                if (!listStack.length || listStack[listStack.length - 1] !== tag) {
                    closeLists();
                    listStack.push(tag);
                    html.push("<" + tag + ">");
                }
                var item = (ul ? ul[1] : ol[1]);
                // 任务列表
                item = item.replace(/^\[( |x|X)\]\s*/, function (m, c) {
                    return '<input type="checkbox" disabled' + (c.toLowerCase() === "x" ? " checked" : "") + "> ";
                });
                html.push("<li>" + renderInline(item) + "</li>");
                continue;
            }

            closeLists();
            html.push("<p>" + renderInline(line) + "</p>");
        }

        if (inCode && codeBuffer.length) html.push("<pre><code>" + escapeHtml(codeBuffer.join("\n")) + "</code></pre>");
        flushQuote();
        closeLists();

        return html.join("\n");
    }

    // ---------- GitHub Alerts ----------
    /**
     * 将 <blockquote> 首行的 [!TYPE] 标记转换为提示块。
     * marked 与应急渲染器输出的结构一致，可统一处理。
     */
    function enhanceAlerts(rootEl) {
        var quotes = rootEl.querySelectorAll("blockquote");
        Array.prototype.forEach.call(quotes, function (quote) {
            var firstEl = quote.firstElementChild;
            var probe = firstEl || quote;
            var text = (probe.textContent || "").trimStart();
            var match = text.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i);
            if (!match) return;

            var type = ALERT_TYPES[match[1].toUpperCase()];

            // 移除标记文本（尽量只动第一个文本节点，保留其余内容）
            var walker = document.createTreeWalker(probe, NodeFilter.SHOW_TEXT, null);
            var node = walker.nextNode();
            while (node) {
                var idx = node.nodeValue.indexOf("[!");
                if (idx !== -1) {
                    node.nodeValue = node.nodeValue.replace(/\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\n?/i, "");
                    break;
                }
                node = walker.nextNode();
            }
            if (firstEl && !firstEl.textContent.trim() && !firstEl.children.length) firstEl.remove();

            var alert = document.createElement("div");
            alert.className = "md-alert md-alert--" + type.cls;
            alert.innerHTML =
                '<div class="md-alert-title">' +
                '<span class="material-symbols-outlined">' + type.icon + "</span>" +
                "<span>" + type.title + "</span></div>" +
                '<div class="md-alert-body"></div>';
            var body = alert.querySelector(".md-alert-body");
            while (quote.firstChild) body.appendChild(quote.firstChild);

            quote.parentNode.replaceChild(alert, quote);
        });
    }

    // 让所有外链在新标签打开
    function normalizeLinks(rootEl) {
        Array.prototype.forEach.call(rootEl.querySelectorAll("a[href]"), function (a) {
            a.target = "_blank";
            a.rel = "noopener";
        });
    }

    // 移除危险节点（release body 由维护者书写，这里做基础防护）
    function sanitize(rootEl) {
        Array.prototype.forEach.call(rootEl.querySelectorAll("script, style, iframe, object, embed, link"), function (el) {
            el.remove();
        });
        Array.prototype.forEach.call(rootEl.querySelectorAll("*"), function (el) {
            Array.prototype.slice.call(el.attributes).forEach(function (attr) {
                if (/^on/i.test(attr.name) || /^javascript:/i.test(attr.value.trim())) {
                    el.removeAttribute(attr.name);
                }
            });
        });
    }

    /**
     * 渲染 Markdown 到指定容器
     * @param {HTMLElement} container 目标容器
     * @param {string} source Markdown 源文本
     */
    function renderInto(container, source) {
        if (!source || !source.trim()) {
            container.innerHTML = '<p class="card-subtitle">没有提供更新日志。</p>';
            return;
        }

        var html = "";
        var usedFallback = false;

        try {
            if (typeof window.marked !== "undefined") {
                html = typeof window.marked.parse === "function"
                    ? window.marked.parse(source)
                    : window.marked(source);
            } else {
                throw new Error("marked 未加载");
            }
        } catch (e) {
            console.warn("marked 渲染失败，使用应急渲染器：", e);
            usedFallback = true;
        }

        if (!html || !html.trim()) { usedFallback = true; }
        if (usedFallback) {
            try {
                html = fallbackMarkdown(source);
            } catch (e2) {
                console.error("应急渲染器同样失败：", e2);
                html = "<pre>" + escapeHtml(source) + "</pre>";
            }
        }

        container.innerHTML = html;
        sanitize(container);
        enhanceAlerts(container);
        normalizeLinks(container);

        if (usedFallback) {
            var tip = document.createElement("p");
            tip.className = "md-fallback-tip typescale-body-medium";
            tip.innerHTML = '<span class="material-symbols-outlined">offline_bolt</span>' +
                "<span>Markdown 渲染库加载失败，已使用内置应急渲染，排版可能略有差异。</span>";
            container.appendChild(tip);
        }
    }

    ICC.markdown = {
        renderInto: renderInto,
        fallback: fallbackMarkdown,
        escapeHtml: escapeHtml
    };
})(window.ICC);
