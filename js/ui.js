/**
 * UI 交互：主题、移动端导航、下载弹窗
 */
window.ICC = window.ICC || {};

(function (ICC) {
    "use strict";

    var CONFIG = ICC.CONFIG;
    var dom = {};
    var countdownTimer = null;
    var cooldownTimer = null;

    // 危险构建确认前的强制阅读时间（秒）
    var CONFIRM_COOLDOWN = 10;

    // ---------- 主题 ----------
    function setTheme(isDark) {
        document.documentElement.classList.toggle("dark", isDark);
        try { localStorage.setItem(CONFIG.STORAGE_KEYS.theme, isDark ? "dark" : "light"); } catch (e) { /* ignore */ }

        var icon = isDark ? "light_mode" : "dark_mode";
        var text = isDark ? "切换到明亮模式" : "切换到深色模式";
        dom.toggleDark.querySelector(".material-symbols-outlined").textContent = icon;
        dom.toggleDarkMobile.querySelector(".material-symbols-outlined").textContent = icon;
        dom.toggleDarkMobile.querySelector("span:last-child").textContent = text;
    }

    function initTheme() {
        var stored = null;
        try { stored = localStorage.getItem(CONFIG.STORAGE_KEYS.theme); } catch (e) { /* ignore */ }
        var systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        setTheme(stored === "dark" || (stored === null && systemDark));
    }

    // ---------- 移动端导航 ----------
    function toggleNav(open) {
        var isOpen = typeof open === "boolean" ? open : !dom.navDrawer.classList.contains("is-open");
        dom.navDrawer.classList.toggle("is-open", isOpen);
        dom.navScrim.classList.toggle("is-open", isOpen);
        dom.navToggle.querySelector(".material-symbols-outlined").textContent = isOpen ? "close" : "menu";
        document.body.style.overflow = isOpen ? "hidden" : "";
    }

    // ---------- 下载 ----------
    function triggerDownload(url) {
        var a = document.createElement("a");
        a.href = url;
        a.download = "";
        a.rel = "noopener";
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    function closeModal() {
        clearInterval(countdownTimer);
        clearInterval(cooldownTimer);
        dom.modal.classList.remove("is-open");
        dom.modal.classList.remove("modal--danger");
    }

    /**
     * 危险构建：先强制阅读 CONFIRM_COOLDOWN 秒，期间勾选框与下载按钮均不可用
     */
    function startConfirmCooldown() {
        clearInterval(cooldownTimer);
        var left = CONFIRM_COOLDOWN;

        dom.confirmCooldown.style.display = "";
        dom.confirmCooldownCount.textContent = left;
        dom.confirmCheck.classList.add("is-locked");
        dom.confirmRisk.disabled = true;

        cooldownTimer = setInterval(function () {
            left--;
            dom.confirmCooldownCount.textContent = Math.max(left, 0);
            if (left > 0) return;

            clearInterval(cooldownTimer);
            dom.confirmCooldown.style.display = "none";
            dom.confirmCheck.classList.remove("is-locked");
            dom.confirmRisk.disabled = false;
        }, 1000);
    }

    /**
     * 展示下载弹窗
     * 普通通道：倒计时后自动开始下载
     * requireConfirm 为 true（如 Nightly/Debug 构建）：不自动下载，
     * 必须勾选风险确认框并点击「继续下载」才会开始
     * @param {{url:string, title:string, fileName:string, channel:object,
     *          warning?:string, requireConfirm?:boolean, warningTitle?:string}} info
     */
    function showDownloadModal(info) {
        clearInterval(countdownTimer);

        dom.modalFile.textContent = info.fileName || "";
        dom.docsLink.href = CONFIG.DOCS_URL;

        var channel = info.channel;
        dom.modalChannel.className = "chip chip--channel chip--" + channel.key;
        dom.modalChannel.innerHTML = '<span class="material-symbols-outlined">' + channel.icon + "</span>" + channel.label;

        dom.modalWarning.style.display = info.warning ? "" : "none";
        if (info.warning) dom.modalWarning.querySelector(".md-alert-body").innerHTML = "<p>" + info.warning + "</p>";

        // 需要手动确认：整个弹窗切换为醒目的危险样式
        var needConfirm = !!info.requireConfirm;
        dom.modal.classList.toggle("modal--danger", needConfirm);
        dom.modalAuto.style.display = needConfirm ? "none" : "";
        dom.modalConfirm.style.display = needConfirm ? "" : "none";

        var downloadUrl = info.url;
        dom.githubSourcePicker.style.display = !needConfirm && info.useGithub ? "flex" : "none";
        if (!needConfirm && info.useGithub) {
            var mirrors = ICC.network.state.githubMirrors;
            dom.githubSourceSelect.innerHTML = mirrors.map(function (mirror) {
                var label = mirror.prefix ? mirror.prefix.replace(/^https?:\/\//, "") : "GitHub 官方直连";
                return '<option value="' + ICC.markdown.escapeHtml(mirror.prefix || "") + '">' +
                    ICC.markdown.escapeHtml(label + " · " + Math.round(mirror.cost) + " ms") + "</option>";
            }).join("");
            dom.githubSourceSelect.value = ICC.network.state.selectedMirror || "";
            dom.githubSourceSelect.onchange = function () {
                ICC.network.selectMirror(dom.githubSourceSelect.value || null);
                downloadUrl = ICC.network.toMirrorUrl(info.originalUrl);
                dom.manualDownload.href = downloadUrl;
            };
            if (!mirrors.length) dom.githubSourcePicker.style.display = "none";
        }

        if (needConfirm) {
            dom.modalTitle.textContent = info.warningTitle || "确认下载风险";
            dom.thankYou.textContent = "您即将下载 InkCanvasForClass CE " + info.title;
            dom.modalWarning.className = "md-alert md-alert--caution";
            dom.modalWarning.querySelector(".md-alert-title").innerHTML =
                '<span class="material-symbols-outlined">dangerous</span><span>危险</span>';

            dom.confirmRisk.checked = false;
            dom.confirmDownload.disabled = true;
            startConfirmCooldown();
            dom.confirmRisk.onchange = function () {
                dom.confirmDownload.disabled = !dom.confirmRisk.checked;
            };
            dom.confirmDownload.onclick = function () {
                if (!dom.confirmRisk.checked || dom.confirmRisk.disabled) return;
                triggerDownload(info.url);
                closeModal();
            };
            dom.confirmCancel.onclick = closeModal;

            dom.modal.classList.add("is-open");
            return;
        }

        dom.modalTitle.textContent = "感谢下载";
        dom.thankYou.textContent = "感谢您下载 InkCanvasForClass CE " + info.title;
        dom.modalWarning.className = "md-alert md-alert--warning";
        dom.modalWarning.querySelector(".md-alert-title").innerHTML =
            '<span class="material-symbols-outlined">warning</span><span>注意</span>';

        var count = 5;
        var started = false;
        dom.countdown.textContent = count;
        dom.manualDownload.href = downloadUrl;
        dom.manualTip.style.display = "none";

        dom.modal.classList.add("is-open");

        countdownTimer = setInterval(function () {
            count--;
            dom.countdown.textContent = Math.max(count, 0);
            if (count <= 0) {
                clearInterval(countdownTimer);
                if (!started) { started = true; triggerDownload(downloadUrl); }
                dom.manualTip.style.display = "";
            }
        }, 1000);

        dom.manualDownload.onclick = function (e) {
            e.preventDefault();
            started = true;
            triggerDownload(dom.manualDownload.href);
            closeModal();
        };
    }

    // ---------- 事件绑定 ----------
    function bind() {
        dom.toggleDark.addEventListener("click", function () {
            setTheme(!document.documentElement.classList.contains("dark"));
        });
        dom.toggleDarkMobile.addEventListener("click", function () {
            setTheme(!document.documentElement.classList.contains("dark"));
        });

        dom.navToggle.addEventListener("click", function () { toggleNav(); });
        dom.navScrim.addEventListener("click", function () { toggleNav(false); });
        Array.prototype.forEach.call(dom.navLinks, function (link) {
            if (link.id !== "toggle-dark-mobile") {
                link.addEventListener("click", function () { toggleNav(false); });
            }
        });

        window.addEventListener("scroll", function () {
            dom.topAppBar.classList.toggle("is-scrolled", window.scrollY > 0);
        });

        dom.closeModal.addEventListener("click", closeModal);
        dom.modal.addEventListener("click", function (e) {
            if (e.target === dom.modal) closeModal();
        });
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") {
                closeModal();
                toggleNav(false);
            }
        });
    }

    function init(elements) {
        dom = elements;
        initTheme();
        bind();
    }

    ICC.ui = {
        init: init,
        setTheme: setTheme,
        showDownloadModal: showDownloadModal,
        closeModal: closeModal
    };
})(window.ICC);
