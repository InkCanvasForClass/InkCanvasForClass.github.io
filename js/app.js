/**
 * 应用入口：收集 DOM、初始化各模块、处理下载点击
 */
(function (ICC) {
    "use strict";

    document.addEventListener("DOMContentLoaded", function () {
        var CONFIG = ICC.CONFIG;
        var net = ICC.network;

        var el = {
            // 主题
            toggleDark: document.getElementById("toggle-dark"),
            toggleDarkMobile: document.getElementById("toggle-dark-mobile"),

            // 导航
            navToggle: document.getElementById("nav-toggle"),
            navDrawer: document.getElementById("mobile-nav-drawer"),
            navScrim: document.getElementById("mobile-nav-scrim"),
            navLinks: document.querySelectorAll("#mobile-nav-drawer a, #mobile-nav-drawer button"),
            topAppBar: document.getElementById("top-app-bar"),

            // 仓库统计
            stars: document.getElementById("github-stars"),
            forks: document.getElementById("github-forks"),
            watchers: document.getElementById("github-watchers"),

            // 发布区
            loading: document.getElementById("release-loading"),
            loadingText: document.querySelector("#release-loading p"),
            list: document.getElementById("release-list"),
            switch: document.getElementById("channel-switch"),
            desc: document.getElementById("channel-desc"),
            mirrorStatus: document.getElementById("mirror-status"),

            // 弹窗
            modal: document.getElementById("download-modal"),
            modalTitle: document.getElementById("modal-title"),
            modalChannel: document.getElementById("modal-channel"),
            modalFile: document.getElementById("modal-file"),
            modalWarning: document.getElementById("modal-warning"),
            manualDownload: document.getElementById("manual-download"),
            manualTip: document.getElementById("manual-download-tip"),
            thankYou: document.getElementById("thank-you-text"),
            countdown: document.getElementById("countdown"),
            docsLink: document.getElementById("docs-link"),
            closeModal: document.getElementById("close-modal"),
            modalAuto: document.getElementById("modal-auto"),
            modalConfirm: document.getElementById("modal-confirm"),
            confirmRisk: document.getElementById("confirm-risk"),
            confirmDownload: document.getElementById("confirm-download"),
            confirmCancel: document.getElementById("confirm-cancel"),
            confirmCheck: document.getElementById("confirm-check"),
            confirmCooldown: document.getElementById("confirm-cooldown"),
            confirmCooldownCount: document.getElementById("confirm-cooldown-count")
        };

        ICC.ui.init(el);
        ICC.releases.init(el);
        bindDownload(el);

        run(el);

        // ---------- 下载点击 ----------
        function bindDownload(el) {
            el.list.addEventListener("click", async function (e) {
                var btn = e.target.closest(".download-btn");
                if (!btn) return;

                var channel = ICC.releases.getChannel();

                // Nightly：固定 nightly.link 地址 + 选定加速节点
                if (btn.dataset.nightlyUrl) {
                    ICC.ui.showDownloadModal({
                        url: net.nightlyUrl(btn.dataset.nightlyUrl),
                        title: btn.dataset.version || "Nightly",
                        fileName: btn.dataset.name,
                        channel: channel,
                        requireConfirm: true,
                        warningTitle: "确认下载 Debug 构建",
                        warning: "这是由 CI 自动产出的 <b>未经测试的 Debug 构建</b>，" +
                            "可能包含严重缺陷、崩溃或数据丢失风险，<b>开发者不承担任何责任，请勿用于正式课堂</b>。<br>" +
                            "如需稳定使用，请返回选择 <b>Beta版</b> 通道。"
                    });
                    return;
                }

                btn.classList.add("is-checking");
                var repoKey = btn.dataset.repo;
                var repo = repoKey === CONFIG.REPOS.communityBeta.key
                    ? CONFIG.REPOS.communityBeta
                    : CONFIG.REPOS.community;

                var url = await net.resolveDownloadUrl(btn.dataset.originalUrl, repo);
                btn.classList.remove("is-checking");

                ICC.ui.showDownloadModal({
                    url: url,
                    title: btn.dataset.version ? "v" + btn.dataset.version : "",
                    fileName: btn.dataset.name,
                    channel: channel,
                    warning: channel.key === "beta"
                        ? "Beta 版包含 pre-release，若遇到问题可切换到 <b>Preview</b> 或 <b>正式版</b>。"
                        : ""
                });
            });
        }

        function setMirrorStatus(el) {
            var parts = [];
            parts.push(net.state.smartTeachAvailable
                ? '<span class="mirror-tag mirror-tag--ok"><span class="material-symbols-outlined">check_circle</span>智教联盟可用</span>'
                : '<span class="mirror-tag mirror-tag--off"><span class="material-symbols-outlined">cancel</span>智教联盟不可用</span>');

            parts.push('<span class="mirror-tag"><span class="material-symbols-outlined">rocket_launch</span>' +
                (net.state.fastestMirror
                    ? "GitHub 加速：" + net.state.fastestMirror.replace(/^https?:\/\//, "")
                    : "GitHub 官方直连") + "</span>");

            el.mirrorStatus.innerHTML = parts.join("");
        }

        // ---------- 启动流程 ----------
        async function run(el) {
            ICC.releases.setLoading(true, "正在检测下载镜像…");

            await Promise.all([net.detectSmartTeach(), net.detectFastestMirror()]);
            setMirrorStatus(el);

            ICC.releases.setLoading(true, "正在获取仓库信息…");
            net.getRepoInfo(CONFIG.REPOS.community).then(function (info) {
                if (!info) return;
                el.stars.innerHTML = '<i class="fa-solid fa-star fa-sm"></i><span>' + info.stargazers_count + "</span>";
                el.forks.innerHTML = '<i class="fa-solid fa-code-fork fa-sm"></i><span>' + info.forks_count + "</span>";
                el.watchers.innerHTML = '<i class="fa-solid fa-eye fa-sm"></i><span>' + info.subscribers_count + "</span>";
            });

            // 使用记忆中的通道（localStorage）加载
            await ICC.releases.load(ICC.releases.getChannel().key, true);

        }
    });
})(window.ICC);
