/**
 * 网络层：镜像检测、GitHub API 拉取、下载地址转换
 */
window.ICC = window.ICC || {};

(function (ICC) {
    "use strict";

    var CONFIG = ICC.CONFIG;

    var state = {
        fastestMirror: null,        // GitHub 加速前缀，如 https://gh.llkk.cc
        smartTeachAvailable: false, // 智教联盟镜像是否可用
        nightlyProxy: null          // Nightly 使用的加速前缀配置项
    };

    function timeoutFetch(url, options, timeout) {
        options = options || {};
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, timeout || CONFIG.REQUEST_TIMEOUT);
        options.signal = controller.signal;
        options.cache = options.cache || "no-store";
        return fetch(url, options).finally(function () { clearTimeout(timer); });
    }

    /** 构造带镜像回退的 GitHub API 地址列表 */
    function buildApiUrls(endpoint) {
        var urls = [];
        function add(u) { if (urls.indexOf(u) === -1) urls.push(u); }

        if (state.fastestMirror) add(state.fastestMirror + "/" + CONFIG.GITHUB_API_BASE + endpoint);
        add(CONFIG.GITHUB_API_BASE + endpoint);
        CONFIG.MIRROR_URLS.forEach(function (m) { add(m + "/" + CONFIG.GITHUB_API_BASE + endpoint); });
        return urls;
    }

    /** 依次尝试多个地址，返回第一个成功的 JSON */
    async function fetchJsonWithFallback(urls) {
        for (var i = 0; i < urls.length; i++) {
            try {
                var res = await fetch(urls[i], { cache: "no-store" });
                if (res.ok) return await res.json();
                console.log("请求失败：" + urls[i] + " 状态码 " + res.status);
            } catch (e) {
                console.log("请求失败：" + urls[i] + " " + e.message);
            }
        }
        return null;
    }

    /** 竞速：返回最快可用的 GitHub 加速前缀（null 表示官方直连最快） */
    async function detectFastestMirror() {
        var endpoint = CONFIG.REPOS.community.name + "/releases/latest";
        var candidates = [{ prefix: null, url: CONFIG.GITHUB_API_BASE + endpoint }];
        CONFIG.MIRROR_URLS.forEach(function (m) {
            candidates.push({ prefix: m, url: m + "/" + CONFIG.GITHUB_API_BASE + endpoint });
        });

        var results = await Promise.all(candidates.map(function (c) {
            var start = performance.now();
            return timeoutFetch(c.url, { method: "HEAD" })
                .then(function () { return { prefix: c.prefix, cost: performance.now() - start }; })
                .catch(function () { return { prefix: c.prefix, cost: Infinity }; });
        }));

        var usable = results.filter(function (r) { return r.cost !== Infinity; })
            .sort(function (a, b) { return a.cost - b.cost; });

        state.fastestMirror = usable.length ? usable[0].prefix : null;
        return state.fastestMirror;
    }

    /** 智教联盟镜像可用性检测 */
    async function detectSmartTeach() {
        try {
            var res = await timeoutFetch(
                CONFIG.SMART_TEACH_DOMAIN + CONFIG.REPOS.community.mirrorPath + "/test.txt",
                { method: "HEAD" }
            );
            state.smartTeachAvailable = res.status < 400;
        } catch (e) {
            state.smartTeachAvailable = false;
        }
        return state.smartTeachAvailable;
    }

    /**
     * Nightly 加速前缀竞速。
     * 注意：nightly.link 不支持 HEAD（返回 404），必须用 GET + Range 探测。
     */
    async function detectNightlyProxy() {
        var probeUrl = CONFIG.NIGHTLY.artifacts[0].url;
        var results = await Promise.all(CONFIG.NIGHTLY.proxies.map(function (p) {
            var start = performance.now();
            return timeoutFetch(p.prefix + probeUrl, {
                method: "GET",
                headers: { Range: "bytes=0-0" }
            }, 6000)
                .then(function (res) {
                    return { proxy: p, cost: res.ok || res.status === 206 ? performance.now() - start : Infinity };
                })
                .catch(function () { return { proxy: p, cost: Infinity }; });
        }));

        var usable = results.filter(function (r) { return r.cost !== Infinity; })
            .sort(function (a, b) { return a.cost - b.cost; });

        state.nightlyProxy = usable.length ? usable[0].proxy : CONFIG.NIGHTLY.proxies[0];
        return state.nightlyProxy;
    }

    /** 套用 GitHub 加速前缀 */
    function toMirrorUrl(url) {
        if (state.fastestMirror && url.indexOf("https://github.com/") === 0) {
            return state.fastestMirror + "/" + url;
        }
        return url;
    }

    /** 构造智教联盟下载地址（按资源所属仓库分目录） */
    function toSmartTeachUrl(url, repo) {
        var fileName = url.split("/").pop();
        return CONFIG.SMART_TEACH_DOMAIN + repo.mirrorPath + "/" + fileName;
    }

    /** 检查智教联盟上是否存在该文件 */
    async function smartTeachHasFile(url, repo) {
        try {
            var res = await timeoutFetch(toSmartTeachUrl(url, repo), { method: "HEAD" });
            return res.status === 200 || res.status === 302 || res.status === 403;
        } catch (e) {
            return false;
        }
    }

    /**
     * 解析实际下载地址
     * zip：优先智教联盟（校验文件存在），否则 GitHub 加速
     * exe：GitHub 加速
     */
    async function resolveDownloadUrl(originalUrl, repo) {
        if (/\.zip$/i.test(originalUrl) && state.smartTeachAvailable) {
            if (await smartTeachHasFile(originalUrl, repo)) return toSmartTeachUrl(originalUrl, repo);
        }
        return toMirrorUrl(originalUrl);
    }

    /** 预览用地址（渲染时使用，不做网络校验） */
    function previewDownloadUrl(originalUrl, repo) {
        if (/\.zip$/i.test(originalUrl) && state.smartTeachAvailable) return toSmartTeachUrl(originalUrl, repo);
        return toMirrorUrl(originalUrl);
    }

    /** Nightly 产物下载地址 */
    function nightlyUrl(rawUrl) {
        var proxy = state.nightlyProxy || CONFIG.NIGHTLY.proxies[0];
        return proxy.prefix + rawUrl;
    }

    // ---------- 业务数据 ----------
    var releasesCache = {};

    async function getReleases(repo) {
        if (releasesCache[repo.name]) return releasesCache[repo.name];
        var data = await fetchJsonWithFallback(buildApiUrls(repo.name + "/releases?per_page=30"));
        releasesCache[repo.name] = data || [];
        return releasesCache[repo.name];
    }

    function getRepoInfo(repo) {
        return fetchJsonWithFallback(buildApiUrls(repo.name));
    }

    /** 最近一次成功的 Nightly 构建信息（失败返回 null，不影响下载） */
    function getLatestNightlyRun() {
        var cfg = CONFIG.NIGHTLY;
        var endpoint = cfg.repo.name + "/actions/workflows/" + cfg.workflow +
            "/runs?branch=" + cfg.branch + "&status=success&per_page=1";
        return fetchJsonWithFallback(buildApiUrls(endpoint)).then(function (data) {
            return data && data.workflow_runs && data.workflow_runs.length ? data.workflow_runs[0] : null;
        }).catch(function () { return null; });
    }

    ICC.network = {
        state: state,
        buildApiUrls: buildApiUrls,
        detectFastestMirror: detectFastestMirror,
        detectSmartTeach: detectSmartTeach,
        detectNightlyProxy: detectNightlyProxy,
        toMirrorUrl: toMirrorUrl,
        resolveDownloadUrl: resolveDownloadUrl,
        previewDownloadUrl: previewDownloadUrl,
        nightlyUrl: nightlyUrl,
        getReleases: getReleases,
        getRepoInfo: getRepoInfo,
        getLatestNightlyRun: getLatestNightlyRun
    };
})(window.ICC);
