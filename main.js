document.addEventListener("DOMContentLoaded", function () {
    // --- DOM元素 ---
    const elements = {
        // 主题
        toggleDarkBtn: document.getElementById("toggle-dark"),
        toggleDarkMobileBtn: document.getElementById("toggle-dark-mobile"),
        
        // 导航
        navToggleBtn: document.getElementById("nav-toggle"),
        mobileNavDrawer: document.getElementById("mobile-nav-drawer"),
        mobileNavScrim: document.getElementById("mobile-nav-scrim"),
        mobileNavLinks: document.querySelectorAll("#mobile-nav-drawer a, #mobile-nav-drawer button"),
        topAppBar: document.getElementById("top-app-bar"),

        // GitHub统计
        githubStars: document.getElementById("github-stars"),
        githubForks: document.getElementById("github-forks"),
        githubWatchers: document.getElementById("github-watchers"),

        // 发布区
        releaseContainer: document.getElementById("release-info"),
        releaseLoading: document.getElementById("release-loading"),
        releaseLoadingText: document.querySelector("#release-loading p"),
        releaseList: document.getElementById("release-list"),
        toggleBetaBtn: document.getElementById("toggle-beta"),
        
        // 弹窗
        downloadModal: document.getElementById("download-modal"),
        manualDownload: document.getElementById("manual-download"),
        manualDownloadTip: document.getElementById("manual-download-tip"),
        thankYouText: document.getElementById("thank-you-text"),
        countdown: document.getElementById("countdown"),
        docsLink: document.getElementById("docs-link"),
        closeModal: document.getElementById("close-modal")
    };

    // --- 常量与状态 ---
    const SMART_TEACH_DOMAIN = "https://get.smart-teach.cn";
    const COMMUNITY_PATH = "/d/Ningbo-S3/shared/jiangling/community";
    const COMMUNITY_BETA_PATH = "/d/Ningbo-S3/shared/jiangling/community-beta";
    const GITHUB_REPO_COMMUNITY = "InkCanvasForClass/community";
    const GITHUB_REPO_COMMUNITY_BETA = "InkCanvasForClass/community-beta";
    const GITHUB_API_BASE = "https://api.github.com/repos/";
    const MIRROR_URLS = [
        "https://gh.llkk.cc",
        "https://ghfile.geekertao.top",
        "https://gh.dpik.top",
        "https://github.dpik.top",
        "https://github.acmsz.top",
        "https://git.yylx.win"
    ];

    let fastestMirror = null;
    let releasesOfficial = [];
    let releasesBeta = [];
    let currentReleases = [];
    let currentIndex = 0;
    let showingBeta = false;
    let smartTeachAvailable = false;

    // --- API与镜像处理 ---
    function buildApiUrls(endpoint) {
        const uniqueUrls = new Set();
        // 优先使用最快镜像
        if (fastestMirror) {
            uniqueUrls.add(`${fastestMirror}/${GITHUB_API_BASE}${endpoint}`);
        }
        // 添加官方URL
        uniqueUrls.add(`${GITHUB_API_BASE}${endpoint}`);
        // 添加所有镜像
        MIRROR_URLS.forEach(mirror => uniqueUrls.add(`${mirror}/${GITHUB_API_BASE}${endpoint}`));
        return Array.from(uniqueUrls);
    }

    // 提取版本号
    function extractVersionFromUrl(url) {
        const regex = /InkCanvasForClass\.CE\.(\d+\.\d+\.\d+\.\d+)\.zip/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }

    // 测试智教下载源的可用性
    async function testSmartTeachAvailability() {
        try {
            // 测试HEAD请求响应时间
            const testUrl = `${SMART_TEACH_DOMAIN}${COMMUNITY_PATH}/test.txt`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            const response = await fetch(testUrl, {
                method: 'HEAD',
                signal: controller.signal,
                cache: 'no-store'
            });
            
            clearTimeout(timeoutId);
            return response.status === 200 || response.status < 400;
        } catch (e) {
            return false;
        }
    }

    // 转换下载URL
    function buildSmartTeachUrl(url, isBeta = false) {
        const fileName = url.split('/').pop();
        const basePath = isBeta ? COMMUNITY_BETA_PATH : COMMUNITY_PATH;
        return `${SMART_TEACH_DOMAIN}${basePath}/${fileName}`;
    }

    function convertDownloadUrl(url, isBeta = false) {
        // 如果是 .exe 文件，强制走镜像源
        if (url.endsWith('.exe')) {
            if (fastestMirror && url.startsWith("https://github.com/")) {
                return url.replace("https://github.com/", `${fastestMirror}/https://github.com/`);
            }
            return url;
        }
        // 智教优先（非 .exe）
        if (smartTeachAvailable) {
            return buildSmartTeachUrl(url, isBeta);
        }
        if (fastestMirror && url.startsWith("https://github.com/")) {
            return url.replace("https://github.com/", `${fastestMirror}/https://github.com/`);
        }
        return url;
    }

    async function fetchDataWithMirrors(urls, errorMessage = "获取数据失败") {
        for (const url of urls) {
            try {
                const res = await fetch(url, { cache: "no-store" });
                if (res.ok) return await res.json();
                console.log(`尝试镜像失败: ${url}, 状态码: ${res.status}`);
            } catch (e) {
                console.log(`尝试镜像失败: ${url}, 错误: ${e.message}`);
            }
        }
        elements.releaseLoadingText.textContent = errorMessage;
        elements.releaseLoading.querySelector('.loader').style.display = 'none';
        return null;
    }

    // 检测最快的镜像
    async function detectFastestMirror() {
        updateLoadingText("正在检测镜像源...");
        const endpoint = `${GITHUB_REPO_COMMUNITY}/releases/latest`;
        const testUrls = [`${GITHUB_API_BASE}${endpoint}`, ...MIRROR_URLS.map(m => `${m}/${GITHUB_API_BASE}${endpoint}`)];
        
        const results = await Promise.all(testUrls.map(url => 
            new Promise(resolve => {
                const start = performance.now();
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000);
                
                fetch(url, { method: "HEAD", cache: "no-store", signal: controller.signal })
                    .then(() => {
                        const timeTaken = performance.now() - start;
                        resolve({url, timeTaken});
                    })
                    .catch(() => resolve({url, timeTaken: Infinity}))
                    .finally(() => clearTimeout(timeoutId));
            })
        ));

        // 按时间排序并排除超时的
        const sortedResults = results
            .filter(result => result.timeTaken !== Infinity)
            .sort((a, b) => a.timeTaken - b.timeTaken);
        
        return sortedResults.length > 0 ? sortedResults[0].url : null;
    }

    // --- 渲染逻辑 ---
    function updateLoadingText(text) {
        if (elements.releaseLoadingText) {
            elements.releaseLoadingText.textContent = text;
        }
    }
    
    function renderRelease(idx) {
        if (!currentReleases || currentReleases.length === 0) {
            elements.releaseList.innerHTML = `<p class="typescale-body-large" style="text-align: center; padding: 2rem 0;">暂无发布版本</p>`;
            return;
        }
    
        const r = currentReleases[idx];
        const assetsHtml = r.assets
            .map(a => {
                // 提取原始下载URL的版本号
                const version = extractVersionFromUrl(a.browser_download_url);
                const downloadUrl = convertDownloadUrl(a.browser_download_url, r._isBeta);
                return `
                    <button data-download-url="${downloadUrl}" 
                            data-original-url="${a.browser_download_url}" 
                            data-version="${version}"
                            class="btn btn--tonal download-btn">
                        <span class="material-symbols-outlined">download</span>
                        <span>${a.name} (${(a.size / 1024 / 1024).toFixed(2)} MB)</span>
                    </button>
                `;
            }).join('') || `<p class="typescale-body-medium card-subtitle">无可用附件</p>`;
    
        const bodyHtml = r.body && typeof marked !== 'undefined'
            ? marked.parse(r.body)
            : `<p class="card-subtitle">${r.body ? r.body.replace(/\r\n/g, '<br>') : '没有提供更新日志。'}</p>`;
    
        const badge = r._isBeta
            ? `<div class="chip">测试版</div>`
            : `<div class="chip" style="background-color: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container);">正式版</div>`;
    
        const html = `
            <article class="release-item">
                <header class="release-item-header">
                    <a href="${r.html_url}" target="_blank" class="typescale-title-large" style="text-decoration: underline;">${r.name || r.tag_name}</a>
                    <div style="display: flex; align-items: center; gap: 1rem; flex-shrink: 0;">
                        <span class="typescale-body-medium card-subtitle">${new Date(r.published_at).toLocaleDateString()}</span>
                        ${badge}
                    </div>
                </header>
                <div class="markdown-body card-subtitle">${bodyHtml}</div>
                <div class="divider" style="margin-block: 1.5rem;"></div>
                <h4 class="typescale-title-medium" style="margin-bottom: 0.75rem;">附件</h4>
                <footer class="release-item-actions">${assetsHtml}</footer>
            </article>
            <div class="release-navigation">
                <button id="prev-release" class="btn btn--outlined" ${idx === 0 ? 'disabled' : ''}>
                    <span class="material-symbols-outlined">arrow_back</span><span>上一版</span>
                </button>
                <span class="typescale-body-medium card-subtitle">${idx + 1} / ${currentReleases.length}</span>
                <button id="next-release" class="btn btn--outlined" ${idx === currentReleases.length - 1 ? 'disabled' : ''}>
                    <span>下一版</span><span class="material-symbols-outlined">arrow_forward</span>
                </button>
            </div>
        `;
    
        elements.releaseList.innerHTML = html;
        document.getElementById("prev-release").onclick = () => { if (currentIndex > 0) renderRelease(--currentIndex); };
        document.getElementById("next-release").onclick = () => { if (currentIndex < currentReleases.length - 1) renderRelease(++currentIndex); };
    }

    // --- 弹窗逻辑 ---
    function showDownloadModal(downloadUrl, version) {
        let countdownValue = 5;
        let countdownInterval;
        let manualDownloadStarted = false;

        // 更新显示内容
        elements.thankYouText.textContent = `感谢您下载 InkCanvasforClass-Community (${version})`;
        elements.countdown.textContent = countdownValue;
        elements.manualDownload.href = downloadUrl;
        elements.manualDownload.textContent = "单击此处下载";
        elements.docsLink.href = "https://inkcanvasforclass.github.io/website";
        elements.manualDownloadTip.style.display = "none";

        // 显示弹窗
        elements.downloadModal.classList.add('is-open');

        // 倒计时逻辑
        countdownInterval = setInterval(() => {
            countdownValue--;
            elements.countdown.textContent = countdownValue;

            if (countdownValue <= 0) {
                clearInterval(countdownInterval);
                // 自动下载
                if (!manualDownloadStarted) {
                    const a = document.createElement('a');
                    a.href = downloadUrl;
                    a.download = '';
                    a.style.display = 'none';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                }
                // 显示手动下载提示
                elements.manualDownloadTip.style.display = "";
            }
        }, 1000);

        // 只绑定一次事件
        if (!elements.manualDownload._binded) {
            elements.manualDownload.addEventListener('click', function(e) {
                e.preventDefault();
                manualDownloadStarted = true;
                clearInterval(countdownInterval);

                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = '';
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);

                // 关闭弹窗
                elements.downloadModal.classList.remove('is-open');
            });
            elements.manualDownload._binded = true;
        }

        if (!elements.closeModal._binded) {
            elements.closeModal.addEventListener('click', function() {
                clearInterval(countdownInterval);
                elements.downloadModal.classList.remove('is-open');
            });
            elements.closeModal._binded = true;
        }
    }

    // 下载按钮事件监听
    function handleDownloadBtnClick() {
        elements.releaseList.addEventListener('click', function(e) {
            const downloadBtn = e.target.closest('.download-btn');
            if (downloadBtn) {
                e.preventDefault();
                const downloadUrl = downloadBtn.getAttribute('data-download-url');
                const version = downloadBtn.getAttribute('data-version') || '最新版';
                const originalUrl = downloadBtn.getAttribute('data-original-url');
                
                // 如果智教不可达，使用原URL
                const effectiveUrl = smartTeachAvailable ? downloadUrl : originalUrl;
                showDownloadModal(effectiveUrl, version);
            }
        });
    }

    // --- UI逻辑 ---
    // 深色模式
    const initDarkMode = () => {
        const storedTheme = localStorage.getItem('theme');
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setTheme(storedTheme === 'dark' || (storedTheme === null && systemPrefersDark));
    };
    
    const setTheme = (isDark) => {
        document.documentElement.classList.toggle('dark', isDark);
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        const icon = isDark ? 'light_mode' : 'dark_mode';
        const text = isDark ? '切换到明亮模式' : '切换到深色模式';
        elements.toggleDarkBtn.querySelector('.material-symbols-outlined').textContent = icon;
        elements.toggleDarkMobileBtn.querySelector('.material-symbols-outlined').textContent = icon;
        elements.toggleDarkMobileBtn.querySelector('span:last-child').textContent = text;
    };
    
    // 移动端导航
    const toggleMobileNav = (open) => {
        const isOpen = typeof open === 'boolean' ? open : !elements.mobileNavDrawer.classList.contains('is-open');
        elements.mobileNavDrawer.classList.toggle('is-open', isOpen);
        elements.mobileNavScrim.classList.toggle('is-open', isOpen);
        elements.navToggleBtn.querySelector('.material-symbols-outlined').textContent = isOpen ? 'close' : 'menu';
        document.body.style.overflow = isOpen ? 'hidden' : '';
    };

    // --- 事件监听与初始化 ---
    function bindEventListeners() {
        elements.toggleDarkBtn.addEventListener('click', () => setTheme(!document.documentElement.classList.contains('dark')));
        elements.toggleDarkMobileBtn.addEventListener('click', () => setTheme(!document.documentElement.classList.contains('dark')));
        
        elements.navToggleBtn.addEventListener('click', () => toggleMobileNav());
        elements.mobileNavScrim.addEventListener('click', () => toggleMobileNav(false));
        elements.mobileNavLinks.forEach(link => {
            if (link.id !== 'toggle-dark-mobile') {
                link.addEventListener('click', () => toggleMobileNav(false));
            }
        });

        window.addEventListener('scroll', () => {
            elements.topAppBar.classList.toggle('is-scrolled', window.scrollY > 0);
        });

        elements.toggleBetaBtn.addEventListener('click', async () => {
            showingBeta = !showingBeta;
            elements.releaseLoading.style.display = 'flex';
            elements.releaseList.style.display = 'none';
            
            elements.toggleBetaBtn.innerHTML = showingBeta
                ? `<span class="material-symbols-outlined">verified</span><span>显示正式版</span>`
                : `<span class="material-symbols-outlined">science</span><span>显示测试版</span>`;

            if (showingBeta && releasesBeta.length === 0) {
                updateLoadingText("正在获取 Beta 版本...");
                const betaUrls = buildApiUrls(`${GITHUB_REPO_COMMUNITY_BETA}/releases`);
                releasesBeta = await fetchDataWithMirrors(betaUrls, "Beta 版本获取失败") || [];
            }
            
            const allReleases = [...releasesOfficial.map(r => ({...r, _isBeta: false})), ...releasesBeta.map(r => ({...r, _isBeta: true}))];
            const sortedReleases = allReleases.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
            
            currentReleases = showingBeta ? sortedReleases : releasesOfficial;
            
            currentIndex = 0;
            elements.releaseLoading.style.display = 'none';
            elements.releaseList.style.display = 'block';
            renderRelease(currentIndex);
        });
    }

    async function init() {
        initDarkMode();
        bindEventListeners();
        handleDownloadBtnClick();
        
        elements.toggleBetaBtn.innerHTML = `<span class="material-symbols-outlined">science</span><span>显示测试版</span>`;

        // 1. 首先检测get.smart-teach.cn的可用性
        updateLoadingText("正在检测智教镜像源...");
        smartTeachAvailable = await testSmartTeachAvailability();
        console.log(`智教镜像源可用: ${smartTeachAvailable}`);
        
        // 2. 检测GitHub镜像
        if (!smartTeachAvailable) {
            updateLoadingText("智教镜像不可用，检测GitHub镜像...");
            fastestMirror = await detectFastestMirror();
        } else {
            updateLoadingText("智教镜像可用，将优先使用...");
        }

        updateLoadingText("正在获取仓库信息...");
        const repoInfoUrls = buildApiUrls(GITHUB_REPO_COMMUNITY);
        const [repoInfo] = await Promise.all([fetchDataWithMirrors(repoInfoUrls)]);
        
        if (repoInfo) {
            elements.githubStars.innerHTML = `<i class="fa-solid fa-star fa-sm"></i><span>${repoInfo.stargazers_count}</span>`;
            elements.githubForks.innerHTML = `<i class="fa-solid fa-code-fork fa-sm"></i><span>${repoInfo.forks_count}</span>`;
            elements.githubWatchers.innerHTML = `<i class="fa-solid fa-eye fa-sm"></i><span>${repoInfo.subscribers_count}</span>`;
        }
        
        updateLoadingText("正在获取正式版本...");
        const releaseUrls = buildApiUrls(`${GITHUB_REPO_COMMUNITY}/releases`);
        releasesOfficial = await fetchDataWithMirrors(releaseUrls, "正式版本获取失败") || [];
        
        currentReleases = releasesOfficial;
        currentIndex = 0;

        elements.releaseLoading.style.display = 'none';
        elements.releaseList.style.display = 'block';
        renderRelease(currentIndex);
    }

    init();
});
