/**
 * 发布版本：通道切换、附件整理与渲染
 */
window.ICC = window.ICC || {};

(function (ICC) {
    "use strict";

    var CONFIG = ICC.CONFIG;
    var CHANNELS = ICC.CHANNELS;
    var net = ICC.network;

    var dom = {};
    var state = {
        channel: ICC.DEFAULT_CHANNEL,
        releases: [],
        index: 0,
        nightlyRun: null
    };

    // ---------- 工具 ----------
    function esc(s) { return ICC.markdown.escapeHtml(s); }

    function formatSize(bytes) {
        if (!bytes && bytes !== 0) return "";
        return (bytes / 1024 / 1024).toFixed(2) + " MB";
    }

    function formatDate(value) {
        var d = new Date(value);
        return d.getFullYear() + "-" +
            String(d.getMonth() + 1).padStart(2, "0") + "-" +
            String(d.getDate()).padStart(2, "0");
    }

    function relativeTime(value) {
        var diff = Date.now() - new Date(value).getTime();
        var day = Math.floor(diff / 86400000);
        if (day <= 0) {
            var hour = Math.floor(diff / 3600000);
            if (hour <= 0) return "刚刚";
            return hour + " 小时前";
        }
        if (day < 30) return day + " 天前";
        if (day < 365) return Math.floor(day / 30) + " 个月前";
        return Math.floor(day / 365) + " 年前";
    }

    /** 解析附件名：版本号 / 架构 / 安装方式 */
    function parseAsset(asset, repo) {
        var name = asset.name || asset.browser_download_url.split("/").pop();
        var versionMatch = name.match(/InkCanvasForClass\.CE\.((?:\d+\.)+\d+)/i);
        var isInstaller = /\.exe$/i.test(name);
        var isX64 = /-x64/i.test(name);
        return {
            name: name,
            size: asset.size,
            url: asset.browser_download_url,
            repo: repo,
            version: versionMatch ? versionMatch[1] : null,
            arch: isX64 ? "x64" : "x86",
            archLabel: isX64 ? "64 位" : "32 位",
            kind: isInstaller ? "installer" : "portable",
            kindLabel: isInstaller ? "安装版" : "绿色版"
        };
    }

    function isNoiseAsset(asset) {
        return /\.sigstore\.json$/i.test(asset.name || "");
    }

    /**
     * 整理某个 release 的附件。
     * community-beta 只发布 zip，安装版按相同 tag 回源主仓库 community。
     */
    function collectAssets(release, channel, fallbackReleases) {
        var list = (release.assets || [])
            .filter(function (a) { return !isNoiseAsset(a); })
            .map(function (a) { return parseAsset(a, channel.repo); });

        var hasInstaller = list.some(function (a) { return a.kind === "installer"; });

        if (!hasInstaller && channel.installerFallbackRepo && fallbackReleases) {
            var tag = release.tag_name;
            var origin = fallbackReleases.filter(function (r) { return r.tag_name === tag; })[0];
            if (origin) {
                (origin.assets || [])
                    .filter(function (a) { return !isNoiseAsset(a) && /\.exe$/i.test(a.name); })
                    .forEach(function (a) {
                        var meta = parseAsset(a, channel.installerFallbackRepo);
                        meta.fromMainRepo = true;
                        list.push(meta);
                    });
            }
        }

        return list.sort(function (a, b) {
            if (a.kind !== b.kind) return a.kind === "installer" ? -1 : 1;
            if (a.arch !== b.arch) return a.arch === "x64" ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
    }

    // ---------- 渲染 ----------
    function setLoading(isLoading, text) {
        dom.loading.style.display = isLoading ? "flex" : "none";
        dom.list.style.display = isLoading ? "none" : "block";
        if (isLoading && text) {
            dom.loadingText.textContent = text;
            var loader = dom.loading.querySelector(".loader");
            if (loader) loader.style.display = "";
        }
    }

    function showError(text) {
        dom.loading.style.display = "flex";
        dom.list.style.display = "none";
        dom.loadingText.textContent = text;
        var loader = dom.loading.querySelector(".loader");
        if (loader) loader.style.display = "none";
    }

    function renderChannelSwitch() {
        dom.switch.innerHTML = ICC.CHANNEL_ORDER.map(function (key) {
            var c = CHANNELS[key];
            var active = key === state.channel;
            return '<button type="button" role="tab" class="segmented-btn segmented-btn--' + key +
                (active ? " is-active" : "") + '"' +
                ' data-channel="' + key + '" aria-selected="' + active + '">' +
                '<span class="material-symbols-outlined">' + c.icon + "</span>" +
                "<span>" + c.shortLabel + "</span>" +
                (c.recommended ? '<span class="segmented-btn-badge">推荐</span>' : "") +
                "</button>";
        }).join("");
    }

    function renderChannelDesc() {
        var c = CHANNELS[state.channel];
        var source = c.type === "nightly"
            ? '<a href="' + c.repo.url + '/actions/workflows/' + CONFIG.NIGHTLY.workflow +
              '" target="_blank" rel="noopener" class="link">' + CONFIG.NIGHTLY.workflow + " · " + CONFIG.NIGHTLY.branch + "</a>"
            : '<a href="' + c.repo.url + '/releases" target="_blank" rel="noopener" class="link">' + c.repo.name + "</a>";

        var extra = "";
        if (c.installerFallbackRepo) {
            extra = '<br><span class="channel-desc-extra">' +
                '<span class="material-symbols-outlined">alt_route</span>' +
                "该通道发布绿色版与安装版。</span>";
        }

        dom.desc.className = "typescale-body-medium channel-desc channel-desc--" + c.key;
        dom.desc.innerHTML =
            '<span class="material-symbols-outlined">' + (c.type === "nightly" ? "warning" : "info") + "</span>" +
            "<span>" + c.desc + " 数据来源：" + source + extra + "</span>";
    }

    function assetButtonHtml(meta) {
        var url = net.previewDownloadUrl(meta.url, meta.repo);
        return '<button type="button" class="download-btn"' +
            ' data-download-url="' + esc(url) + '"' +
            ' data-original-url="' + esc(meta.url) + '"' +
            ' data-repo="' + meta.repo.key + '"' +
            ' data-version="' + esc(meta.version || "") + '"' +
            ' data-name="' + esc(meta.name) + '">' +
            '<span class="material-symbols-outlined download-btn-icon">download</span>' +
            '<span class="download-btn-text">' +
            '<span class="download-btn-title">' + esc(meta.archLabel) +
            (meta.version ? ' <span class="download-btn-version">v' + esc(meta.version) + "</span>" : "") + "</span>" +
            '<span class="download-btn-meta">' + esc(meta.kindLabel) + " · " + formatSize(meta.size) +
            (meta.fromMainRepo ? ' · <span class="download-btn-tag">主仓库</span>' : "") + "</span>" +
            "</span></button>";
    }

    function assetGroupsHtml(assets) {
        var groups = [
            { kind: "installer", title: "安装版", icon: "install_desktop", hint: "自动安装并创建快捷方式，推荐日常使用" },
            { kind: "portable", title: "绿色版", icon: "folder_zip", hint: "解压即用，不写入系统" }
        ];

        var html = groups.map(function (g) {
            var items = assets.filter(function (a) { return a.kind === g.kind; });
            if (!items.length) return "";
            return '<div class="asset-group">' +
                '<div class="asset-group-header">' +
                '<span class="material-symbols-outlined">' + g.icon + "</span>" +
                '<span class="typescale-title-medium">' + g.title + "</span>" +
                '<span class="typescale-body-medium card-subtitle asset-group-hint">' + g.hint + "</span>" +
                "</div>" +
                '<div class="asset-group-items">' + items.map(assetButtonHtml).join("") + "</div>" +
                "</div>";
        }).join("");

        return html || '<p class="typescale-body-medium card-subtitle">该版本暂无可用附件。</p>';
    }

    function renderRelease() {
        var channel = CHANNELS[state.channel];

        if (!state.releases.length) {
            dom.list.innerHTML =
                '<div class="release-empty">' +
                '<span class="material-symbols-outlined">inbox</span>' +
                '<p class="typescale-body-large">该通道暂无可用发布版本</p></div>';
            return;
        }

        var idx = state.index;
        var item = state.releases[idx];
        var release = item.release;

        var badges = ['<span class="chip chip--channel chip--' + channel.key + '">' +
            '<span class="material-symbols-outlined">' + channel.icon + "</span>" + channel.label + "</span>"];
        if (release.prerelease) {
            badges.push('<span class="chip chip--prerelease"><span class="material-symbols-outlined">bolt</span>Pre-release</span>');
        }
        if (idx === 0) {
            badges.push('<span class="chip chip--latest"><span class="material-symbols-outlined">new_releases</span>最新</span>');
        }

        dom.list.innerHTML =
            '<article class="release-item">' +
            '<header class="release-item-header">' +
            '<div class="release-item-heading">' +
            '<a href="' + esc(release.html_url) + '" target="_blank" rel="noopener" class="typescale-title-large release-item-title">' +
            esc(release.name || release.tag_name) +
            '<span class="material-symbols-outlined">open_in_new</span></a>' +
            '<span class="typescale-body-medium card-subtitle release-item-date">' +
            '<span class="material-symbols-outlined">schedule</span>' +
            formatDate(release.published_at) + "（" + relativeTime(release.published_at) + "）</span>" +
            "</div>" +
            '<div class="release-item-badges">' + badges.join("") + "</div>" +
            "</header>" +
            '<div class="markdown-body release-item-body"></div>' +
            '<div class="divider" style="margin-block: 1.5rem;"></div>' +
            '<h4 class="typescale-title-medium release-assets-title">' +
            '<span class="material-symbols-outlined">download_for_offline</span><span>下载</span></h4>' +
            '<footer class="release-item-actions">' + assetGroupsHtml(item.assets) + "</footer>" +
            "</article>" +
            '<div class="release-navigation">' +
            '<button id="prev-release" class="btn btn--outlined"' + (idx === 0 ? " disabled" : "") + ">" +
            '<span class="material-symbols-outlined">arrow_back</span><span>上一版</span></button>' +
            '<span class="typescale-body-medium card-subtitle">' + (idx + 1) + " / " + state.releases.length + "</span>" +
            '<button id="next-release" class="btn btn--outlined"' + (idx === state.releases.length - 1 ? " disabled" : "") + ">" +
            '<span>下一版</span><span class="material-symbols-outlined">arrow_forward</span></button>' +
            "</div>";

        ICC.markdown.renderInto(dom.list.querySelector(".release-item-body"), release.body);

        dom.list.querySelector("#prev-release").onclick = function () {
            if (state.index > 0) { state.index--; renderRelease(); }
        };
        dom.list.querySelector("#next-release").onclick = function () {
            if (state.index < state.releases.length - 1) { state.index++; renderRelease(); }
        };
    }

    function renderNightly() {
        var run = state.nightlyRun;
        var proxy = net.state.nightlyProxy || CONFIG.NIGHTLY.proxies[0];

        var runInfo = run
            ? '<div class="nightly-run">' +
              '<div class="nightly-run-item"><span class="material-symbols-outlined">tag</span>' +
              '<span>构建 #' + run.run_number + "</span></div>" +
              '<div class="nightly-run-item"><span class="material-symbols-outlined">commit</span>' +
              '<a href="' + esc(CONFIG.NIGHTLY.repo.url) + "/commit/" + esc(run.head_sha) + '" target="_blank" rel="noopener" class="link">' +
              esc(String(run.head_sha).slice(0, 7)) + "</a></div>" +
              '<div class="nightly-run-item"><span class="material-symbols-outlined">schedule</span>' +
              "<span>" + formatDate(run.updated_at) + "（" + relativeTime(run.updated_at) + "）</span></div>" +
              '<div class="nightly-run-item nightly-run-title"><span class="material-symbols-outlined">notes</span>' +
              "<span>" + esc(String(run.display_title || "").split("\n")[0]) + "</span></div>" +
              "</div>"
            : '<p class="typescale-body-medium card-subtitle">未能获取构建信息（可能触发 GitHub API 限流），但下载依然可用。</p>';

        var proxyOptions = CONFIG.NIGHTLY.proxies.map(function (p) {
            return '<button type="button" class="proxy-chip' + (p.key === proxy.key ? " is-active" : "") + '"' +
                ' data-proxy="' + p.key + '">' + esc(p.label) + "</button>";
        }).join("");

        var cards = CONFIG.NIGHTLY.artifacts.map(function (a) {
            return '<button type="button" class="download-btn"' +
                ' data-nightly-url="' + esc(a.url) + '"' +
                ' data-version="Nightly ' + (run ? "#" + run.run_number : "") + '"' +
                ' data-name="' + esc(a.url.split("/").pop()) + '">' +
                '<span class="material-symbols-outlined download-btn-icon">nightlight</span>' +
                '<span class="download-btn-text">' +
                '<span class="download-btn-title">' + esc(a.archLabel) +
                ' <span class="download-btn-version">Debug</span></span>' +
                '<span class="download-btn-meta">' + esc(a.note) + "</span>" +
                "</span></button>";
        }).join("");

        dom.list.innerHTML =
            '<article class="release-item release-item--nightly">' +
            '<header class="release-item-header">' +
            '<div class="release-item-heading">' +
            '<a href="' + esc(CONFIG.NIGHTLY.repo.url) + "/actions/workflows/" + esc(CONFIG.NIGHTLY.workflow) +
            '" target="_blank" rel="noopener" class="typescale-title-large release-item-title">' +
            "Nightly（" + esc(CONFIG.NIGHTLY.branch) + " 分支）" +
            '<span class="material-symbols-outlined">open_in_new</span></a>' +
            '<span class="typescale-body-medium card-subtitle release-item-date">' +
            '<span class="material-symbols-outlined">construction</span>由 GitHub Actions 自动构建</span>' +
            "</div>" +
            '<div class="release-item-badges">' +
            '<span class="chip chip--channel chip--nightly"><span class="material-symbols-outlined">nightlight</span>Nightly</span>' +
            '<span class="chip chip--prerelease"><span class="material-symbols-outlined">bug_report</span>Debug</span>' +
            "</div></header>" +
            '<div class="md-alert md-alert--caution">' +
            '<div class="md-alert-title"><span class="material-symbols-outlined">dangerous</span><span>危险</span></div>' +
            '<div class="md-alert-body"><p>Nightly 为<b>未经测试</b>的 Debug 构建，可能包含严重缺陷、崩溃或数据丢失风险，' +
            "<b>请勿在正式课堂环境使用</b>。遇到问题请优先回退到 Beta 或正式版。</p></div></div>" +
            runInfo +
            '<div class="divider" style="margin-block: 1.5rem;"></div>' +
            '<div class="nightly-proxy">' +
            '<span class="typescale-body-medium card-subtitle">下载加速（仅支持以下节点）：</span>' +
            '<div class="proxy-chips">' + proxyOptions + "</div>" +
            "</div>" +
            '<footer class="release-item-actions">' +
            '<div class="asset-group"><div class="asset-group-header">' +
            '<span class="material-symbols-outlined">folder_zip</span>' +
            '<span class="typescale-title-medium">构建产物</span>' +
            '<span class="typescale-body-medium card-subtitle asset-group-hint">解压即用，无安装版</span></div>' +
            '<div class="asset-group-items">' + cards + "</div></div>" +
            "</footer></article>";

        Array.prototype.forEach.call(dom.list.querySelectorAll(".proxy-chip"), function (chip) {
            chip.addEventListener("click", function () {
                var key = chip.dataset.proxy;
                var found = CONFIG.NIGHTLY.proxies.filter(function (p) { return p.key === key; })[0];
                if (!found) return;
                net.state.nightlyProxy = found;
                try { localStorage.setItem(CONFIG.STORAGE_KEYS.nightlyProxy, key); } catch (e) { /* ignore */ }
                renderNightly();
            });
        });
    }

    // ---------- 通道切换 ----------
    async function loadChannel(key, force) {
        if (!CHANNELS[key]) key = ICC.DEFAULT_CHANNEL;
        if (key === state.channel && !force) return;

        state.channel = key;
        try { localStorage.setItem(CONFIG.STORAGE_KEYS.channel, key); } catch (e) { /* ignore */ }

        renderChannelSwitch();
        renderChannelDesc();

        var channel = CHANNELS[key];
        setLoading(true, "正在获取 " + channel.label + " …");

        if (channel.type === "nightly") {
            if (!net.state.nightlyProxy) await net.detectNightlyProxy();
            if (!state.nightlyRun) state.nightlyRun = await net.getLatestNightlyRun();
            setLoading(false);
            renderNightly();
            return;
        }

        var releases = await net.getReleases(channel.repo);
        var fallbackReleases = null;
        if (channel.installerFallbackRepo) {
            fallbackReleases = await net.getReleases(channel.installerFallbackRepo);
        }

        if (!releases.length) {
            showError("未能获取 " + channel.label + " 的发布信息，请稍后重试或直接前往 GitHub。");
            return;
        }

        state.releases = releases
            .filter(function (r) { return !r.draft; })
            .filter(function (r) { return channel.includePrerelease ? true : !r.prerelease; })
            .sort(function (a, b) { return new Date(b.published_at) - new Date(a.published_at); })
            .map(function (r) { return { release: r, assets: collectAssets(r, channel, fallbackReleases) }; });

        state.index = 0;
        setLoading(false);
        renderRelease();
    }

    function init(elements) {
        dom = elements;

        var saved = null;
        try { saved = localStorage.getItem(CONFIG.STORAGE_KEYS.channel); } catch (e) { /* ignore */ }
        state.channel = CHANNELS[saved] ? saved : ICC.DEFAULT_CHANNEL;

        var savedProxy = null;
        try { savedProxy = localStorage.getItem(CONFIG.STORAGE_KEYS.nightlyProxy); } catch (e) { /* ignore */ }
        if (savedProxy) {
            var found = CONFIG.NIGHTLY.proxies.filter(function (p) { return p.key === savedProxy; })[0];
            if (found) net.state.nightlyProxy = found;
        }

        renderChannelSwitch();
        renderChannelDesc();

        dom.switch.addEventListener("click", function (e) {
            var btn = e.target.closest(".segmented-btn");
            if (btn) loadChannel(btn.dataset.channel);
        });
    }

    ICC.releases = {
        init: init,
        load: loadChannel,
        setLoading: setLoading,
        showError: showError,
        getChannel: function () { return CHANNELS[state.channel]; }
    };
})(window.ICC);
