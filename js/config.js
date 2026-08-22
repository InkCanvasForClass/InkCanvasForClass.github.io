/**
 * 全局配置与更新通道定义
 * -------------------------------------------------------------
 * 更新通道说明：
 *  正式版 (stable) ：主仓库 community 的 release，不含 pre-release
 *  Preview (preview)：beta 仓库 community-beta 的 release，不含 pre-release
 *  Beta   (beta)   ：beta 仓库 community-beta 的 release，包含 pre-release
 *  Nightly(nightly)：dotnet-desktop 工作流 net6 分支的最新构建产物
 *
 * 注：community-beta 仓库只发布绿色版(zip)，因此 Preview / Beta 通道的
 *     安装版(exe) 会按相同 tag 回源到主仓库 community 获取。
 */
window.ICC = window.ICC || {};

(function (ICC) {
    "use strict";

    var REPOS = {
        community: {
            key: "community",
            name: "InkCanvasForClass/community",
            url: "https://github.com/InkCanvasForClass/community",
            mirrorPath: "/d/Ningbo-S3/shared/jiangling/community"
        },
        communityBeta: {
            key: "communityBeta",
            name: "InkCanvasForClass/community-beta",
            url: "https://github.com/InkCanvasForClass/community-beta",
            mirrorPath: "/d/Ningbo-S3/shared/jiangling/community-beta"
        }
    };

    ICC.CONFIG = {
        REPOS: REPOS,

        GITHUB_API_BASE: "https://api.github.com/repos/",
        SMART_TEACH_DOMAIN: "https://get.smart-teach.cn",

        // GitHub Release / API 通用加速镜像
        MIRROR_URLS: [
            "https://github.akams.cn",
            "https://gh.llkk.cc",
            "https://ghfile.geekertao.top",
            "https://gh.dpik.top",
            "https://github.dpik.top",
            "https://github.acmsz.top",
            "https://git.yylx.win",
            "https://github.tbap.top",
            "https://ghproxy.net",
            "https://gh-proxy.com",
            "https://gh-proxy.net",
            "https://cdn.gh-proxy.com",
            "https://j.1lin.dpdns.org",
            "https://github.starrlzy.cn",
            "https://github-proxy.memory-echoes.cn",
            "https://tvv.tw",
            "https://j.1win.ggff.net",
            "https://gitproxy.127731.xyz",
            "https://gh.inkchills.cn",
            "https://gh.catmak.name",
            "https://gh.b52m.cn",
            "https://down.mxw.xx.kg",
            "https://githubdog.com",
            "https://gh.meali.top",
            "https://xsadwsd.kdns.fr",
            "https://gh.ruan.dpdns.org",
            "https://ghproxy.felicity.land",
            "https://github.nswrz.cn",
            "https://gh.zhai.edu.pl"
        ],

        // Nightly（CI 构建）配置
        NIGHTLY: {
            repo: REPOS.community,
            workflow: "dotnet-desktop.yml",
            branch: "net6",
            // nightly.link 只支持以下两个加速前缀
            proxies: [
                { key: "direct", label: "官方直连", prefix: "" },
                { key: "gh-proxy", label: "gh-proxy.org", prefix: "https://gh-proxy.org/" },
                { key: "hlmirror", label: "all.hlmirror.com", prefix: "https://all.hlmirror.com/" }
            ],
            artifacts: [
                {
                    arch: "x86",
                    archLabel: "32 位",
                    note: "适用于32位系统",
                    url: "https://nightly.link/InkCanvasForClass/community/workflows/dotnet-desktop/net6/InkCanvasForClass.CE.debug.x86.zip"
                },
                {
                    arch: "x64",
                    archLabel: "64 位",
                    note: "适用于64位系统",
                    url: "https://nightly.link/InkCanvasForClass/community/workflows/dotnet-desktop/net6/InkCanvasForClass.CE.debug.AnyCPU.zip"
                }
            ]
        },

        STORAGE_KEYS: {
            channel: "icc-release-channel",
            nightlyProxy: "icc-nightly-proxy",
            theme: "theme"
        },

        DOCS_URL: "https://inkcanvasforclass.github.io/website",
        REQUEST_TIMEOUT: 3000
    };

    ICC.CHANNELS = {
        beta: {
            key: "beta",
            type: "release",
            label: "Beta 版",
            shortLabel: "Beta",
            icon: "science",
            recommended: true,
            repo: REPOS.communityBeta,
            includePrerelease: true,
            // 该仓库无 exe，安装版按 tag 回源主仓库
            installerFallbackRepo: REPOS.community,
            desc: "来自 <b>community-beta</b> 仓库的全部发布（<b>包含</b> pre-release）。更新最快、修复最及时，是目前<b>最推荐</b>的日常使用版本。"
        },
        preview: {
            key: "preview",
            type: "release",
            label: "Preview 版",
            shortLabel: "Preview",
            icon: "auto_awesome",
            repo: REPOS.communityBeta,
            includePrerelease: false,
            installerFallbackRepo: REPOS.community,
            desc: "来自 <b>community-beta</b> 仓库的正式发布（<b>不含</b> pre-release）。相比 Beta 更为收敛，适合想尝鲜又偏好稳定的用户。"
        },
        stable: {
            key: "stable",
            type: "release",
            label: "正式版",
            shortLabel: "正式版",
            icon: "verified",
            repo: REPOS.community,
            includePrerelease: false,
            desc: "来自主仓库 <b>community</b> 的正式发布（<b>不含</b> pre-release）。发布频率最低，适合对稳定性要求极高的场景。"
        },
        nightly: {
            key: "nightly",
            type: "nightly",
            label: "Nightly 构建",
            shortLabel: "Nightly",
            icon: "nightlight",
            repo: REPOS.community,
            desc: "由 GitHub Actions 自动构建的 <b>Debug</b> 产物（net6 分支最新提交），未经测试、可能无法正常运行，仅供开发者与测试者使用。"
        }
    };

    ICC.CHANNEL_ORDER = ["beta", "preview", "stable", "nightly"];
    ICC.DEFAULT_CHANNEL = "beta";
})(window.ICC);
