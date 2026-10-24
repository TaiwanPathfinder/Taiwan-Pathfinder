/*----------------------------------------------------
  首頁新版（index / homeZN）共用腳本
  語言相關的欄位名稱與文字由頁面上的 window.HOME_CONFIG 提供：
  中文頁讀「活動類型」「評論（中文）」，英文頁讀「活動類型 EN」「評論 EN」。
----------------------------------------------------*/

// 參加者回饋 CSV（Google 試算表匯出；不要加 gid=0，第一個工作表的 gid 不是 0）。
// 留空字串＝不顯示回饋區塊（整區含標題隱藏）。
var REVIEWS_CSV_URL = 'https://docs.google.com/spreadsheets/d/1m-8S4W0F_9EkeXzYCyAoNv70ph5YHSthR2dsMNSoCVI/export?format=csv';

(function(){
    var CFG = window.HOME_CONFIG;
    var T = CFG.text;
    var CSV_URL = 'https://docs.google.com/spreadsheets/d/1VvRRgURxwP4ka_it5MCn96JD6XzbjKS6CGEnWYE_afU/export?format=csv&gid=0';
    var GALLERY_DIR = '/adventurepics/gallery/';
    var GALLERY_PAGE_SIZE = 8;
    var SESSION_LIMIT = 6;
    var isZh = CFG.lang === 'zh';
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var WEEKDAYS_EN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var WEEKDAYS_ZH = ['日', '一', '二', '三', '四', '五', '六'];

    // The sheet only has a Chinese "報名狀態標籤" column, so the English page translates it.
    var STATUS_TAG_EN = { '報名中': 'Open', '已成團': 'Confirmed to Run', '即將額滿': 'Almost Full' };
    var STATUS_TAG_CLASS = { '報名中': 'statusTag-open', '已成團': 'statusTag-confirmed', '即將額滿': 'statusTag-almost-full' };
    var STATUS_TAG_ICON = { '已成團': '✓ ' };

    function esc(s){
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // 簡單但正確處理引號內逗號/換行的 CSV parser
    function parseCSV(text){
        var rows = [], row = [], field = '', inQuotes = false;
        for (var i = 0; i < text.length; i++){
            var c = text[i];
            if (inQuotes){
                if (c === '"'){
                    if (text[i+1] === '"'){ field += '"'; i++; }
                    else { inQuotes = false; }
                } else {
                    field += c;
                }
            } else {
                if (c === '"'){ inQuotes = true; }
                else if (c === ','){ row.push(field); field = ''; }
                else if (c === '\r'){ /* skip */ }
                else if (c === '\n'){ row.push(field); rows.push(row); row = []; field = ''; }
                else { field += c; }
            }
        }
        if (field.length || row.length){ row.push(field); rows.push(row); }
        return rows;
    }

    function pad2(n){ return n < 10 ? '0' + n : '' + n; }
    function toDate(dstr){ return new Date(dstr + 'T00:00:00'); }

    function fmtDateShort(dstr){
        var d = toDate(dstr);
        if (isNaN(d.getTime())) return dstr;
        return isZh ? (d.getMonth() + 1) + '/' + d.getDate() : MONTHS[d.getMonth()] + ' ' + d.getDate();
    }

    function fmtDateWeekday(dstr){
        var d = toDate(dstr);
        if (isNaN(d.getTime())) return dstr;
        return isZh
            ? d.getFullYear() + '/' + pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()) + '（' + WEEKDAYS_ZH[d.getDay()] + '）'
            : MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear() + ' (' + WEEKDAYS_EN[d.getDay()] + ')';
    }

    function toMMDDYYYY(dstr){
        var parts = (dstr || '').split('-');
        if (parts.length !== 3) return '';
        return parts[1] + '/' + parts[2] + '/' + parts[0];
    }

    function withSessionDateParam(url, dstr){
        if (!url) return '';
        var sep = url.indexOf('?') >= 0 ? '&' : '?';
        return url + sep + 'session_date_param=' + toMMDDYYYY(dstr);
    }

    function statusTagHtml(tag){
        if (!tag) return '';
        var cls = STATUS_TAG_CLASS[tag] || 'statusTag-open';
        var icon = STATUS_TAG_ICON[tag] || '';
        return '<span class="statusTag ' + cls + '">' + icon + esc(isZh ? tag : (STATUS_TAG_EN[tag] || tag)) + '</span>';
    }

    /* ==================================================================
       共用輪播：活動輪播與回饋輪播都用這一個函式
       - 每約 4 秒平滑捲動一張，到最後回到第一張
       - 滑鼠移入／觸控／鍵盤聚焦立即暫停，離開或停止操作 3 秒後恢復
       - 分頁不在前景時暫停；prefers-reduced-motion: reduce 時完全不自動播放
       - 暫停/播放鈕、左右箭頭、小圓點、鍵盤左右鍵；桌機可用滑鼠拖曳
       - 只有水平捲動容器（overflow-x），不攔截頁面的上下捲動
       ================================================================== */
    var AUTOPLAY_MS = 4000;
    var RESUME_MS = 3000;

    function createCarousel(root){
        var track = root.querySelector('.hmCarTrack');
        var prevBtn = root.querySelector('.hmCarPrev');
        var nextBtn = root.querySelector('.hmCarNext');
        var pauseBtn = root.querySelector('.hmCarPause');
        var dotsBox = root.querySelector('.hmCarDots');
        var hovering = false, focused = false, touching = false, userPaused = false;
        var holdUntil = 0;

        function items(){ return [].filter.call(track.children, function(el){ return !el.hidden; }); }
        function step(){
            var list = items();
            if (list.length < 2) return track.clientWidth;
            return list[1].offsetLeft - list[0].offsetLeft;
        }
        function currentIndex(){ return Math.round(track.scrollLeft / Math.max(1, step())); }
        function atEnd(){ return track.scrollLeft + track.clientWidth >= track.scrollWidth - 4; }
        function goTo(i, instant){
            var list = items();
            if (!list.length) return;
            i = Math.max(0, Math.min(i, list.length - 1));
            track.scrollTo({ left: list[i].offsetLeft - list[0].offsetLeft, behavior: (instant || reduceMotion) ? 'auto' : 'smooth' });
        }
        function next(){ if (atEnd()) goTo(0); else goTo(currentIndex() + 1); }
        function prev(){ goTo(currentIndex() - 1); }
        function hold(){ holdUntil = Date.now() + RESUME_MS; }

        function renderDots(){
            if (!dotsBox) return;
            dotsBox.innerHTML = '';
            items().forEach(function(_, i){
                var d = document.createElement('button');
                d.type = 'button';
                d.className = 'hmCarDot';
                d.setAttribute('aria-label', T.slideLabel.replace('{n}', i + 1));
                d.addEventListener('click', function(){ hold(); goTo(i); });
                dotsBox.appendChild(d);
            });
            updateDots();
        }
        function updateDots(){
            if (!dotsBox) return;
            var cur = atEnd() ? items().length - 1 : currentIndex();
            [].forEach.call(dotsBox.children, function(d, i){
                d.classList.toggle('is-active', i === cur);
                d.setAttribute('aria-current', i === cur ? 'true' : 'false');
            });
        }

        function updatePauseBtn(){
            if (!pauseBtn) return;
            pauseBtn.setAttribute('aria-pressed', userPaused ? 'true' : 'false');
            pauseBtn.setAttribute('aria-label', userPaused ? T.play : T.pause);
            pauseBtn.textContent = userPaused ? '▶' : '❚❚';
        }

        // 自動播放：條件都允許時才前進
        function tick(){
            if (reduceMotion || userPaused || hovering || focused || touching || document.hidden) return;
            if (Date.now() < holdUntil) return;
            if (items().length < 2) return;
            next();
        }
        if (!reduceMotion) setInterval(tick, AUTOPLAY_MS);
        else if (pauseBtn) pauseBtn.hidden = true;

        prevBtn.addEventListener('click', function(){ hold(); prev(); });
        nextBtn.addEventListener('click', function(){ hold(); next(); });
        if (pauseBtn) pauseBtn.addEventListener('click', function(){ userPaused = !userPaused; hold(); updatePauseBtn(); });

        root.addEventListener('mouseenter', function(){ hovering = true; });
        root.addEventListener('mouseleave', function(){ hovering = false; hold(); });
        root.addEventListener('focusin', function(){ focused = true; });
        root.addEventListener('focusout', function(e){ if (!root.contains(e.relatedTarget)){ focused = false; hold(); } });
        track.addEventListener('touchstart', function(){ touching = true; }, { passive: true });
        track.addEventListener('touchend', function(){ touching = false; hold(); }, { passive: true });
        track.addEventListener('wheel', hold, { passive: true });
        track.addEventListener('keydown', function(e){
            if (e.key === 'ArrowRight'){ e.preventDefault(); hold(); next(); }
            else if (e.key === 'ArrowLeft'){ e.preventDefault(); hold(); prev(); }
        });
        var scrollTimer;
        track.addEventListener('scroll', function(){ clearTimeout(scrollTimer); scrollTimer = setTimeout(updateDots, 80); }, { passive: true });

        // 桌機滑鼠拖曳（只處理滑鼠；觸控交給瀏覽器原生滑動）
        var dragX = null, dragLeft = 0, dragged = false;
        track.addEventListener('pointerdown', function(e){
            if (e.pointerType !== 'mouse' || e.button !== 0) return;
            dragX = e.clientX; dragLeft = track.scrollLeft; dragged = false;
        });
        window.addEventListener('pointermove', function(e){
            if (dragX === null) return;
            var dx = e.clientX - dragX;
            if (!dragged && Math.abs(dx) > 5){ dragged = true; track.classList.add('is-dragging'); }
            if (dragged){ track.scrollLeft = dragLeft - dx; e.preventDefault(); }
        });
        window.addEventListener('pointerup', function(){
            if (dragX === null) return;
            dragX = null;
            if (dragged){ track.classList.remove('is-dragging'); hold(); goTo(currentIndex()); }
        });
        // 拖曳結束時不要觸發卡片連結
        track.addEventListener('click', function(e){ if (dragged){ e.preventDefault(); e.stopPropagation(); dragged = false; } }, true);
        track.addEventListener('dragstart', function(e){ e.preventDefault(); });

        document.addEventListener('visibilitychange', function(){ if (!document.hidden) hold(); });

        updatePauseBtn();
        renderDots();
        return {
            // 篩選後：重建小圓點並回到第一張
            refresh: function(){ renderDots(); goTo(0, true); hold(); }
        };
    }

    /* -------- 跑馬燈（沿用原首頁邏輯） -------- */

    var marqueeBar = document.getElementById('marqueeBar');
    var marqueeTrack = document.getElementById('marqueeTrack');

    function marqueeItemHtml(r){
        var label = esc(fmtDateShort(r.date)) + ' ' + esc(r.type) + '・';
        var href = r.formLink ? esc(withSessionDateParam(r.formLink, r.date)) : '#';
        return '<a class="marqueeItem" href="' + href + '" target="_blank" rel="noopener">' +
            label + esc(r.price) + statusTagHtml(r.statusTag) + '</a>';
    }

    function renderMarqueeStatic(html){
        marqueeBar.classList.add('marqueeStatic');
        marqueeTrack.innerHTML = html;
    }

    function renderMarquee(list){
        var sep = '<span class="marqueeSep" aria-hidden="true">◆</span>';
        var htmlOnce = list.slice(0, 5).map(function(r){ return marqueeItemHtml(r) + sep; }).join('');
        if (reduceMotion) renderMarqueeStatic(htmlOnce);
        else marqueeTrack.innerHTML = htmlOnce + htmlOnce;
    }

    /* -------- 近期開放場次（最多 6 場；左右捲動輪播） -------- */

    var sessionGrid = document.getElementById('sessionGrid');
    var sessionIconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>';

    function sessionCardHtml(r){
        var href = r.formLink ? esc(withSessionDateParam(r.formLink, r.date)) : esc(CFG.bookingUrl);
        return '<div class="sessionCard">' +
            '<span class="sessionIcon">' + sessionIconSvg + '</span>' +
            '<h3>' + esc(r.type) + '</h3>' +
            '<p class="sessionDate">' + esc(fmtDateWeekday(r.date)) + ' ' + statusTagHtml(r.statusTag) + '</p>' +
            '<p class="sessionPrice">' + esc(r.price) + '</p>' +
            '<a class="sessionCta" href="' + href + '" target="_blank" rel="noopener">' + esc(T.bookNow) + '</a>' +
            '</div>';
    }

    /* -------- 活動輪播：難度篩選＋每張卡的原價與下一場 -------- */

    var actRoot = document.getElementById('actCarousel');
    var actCarousel = createCarousel(actRoot);

    document.querySelectorAll('.hmFilterBtn').forEach(function(btn){
        btn.addEventListener('click', function(){
            var f = btn.getAttribute('data-filter');
            document.querySelectorAll('.hmFilterBtn').forEach(function(b){
                b.classList.toggle('is-active', b === btn);
                b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
            });
            actRoot.querySelectorAll('.hmActCard').forEach(function(card){
                var lv = card.getAttribute('data-level');
                card.hidden = !(f === 'all' || lv === 'always' || lv === f);
            });
            actCarousel.refresh();
        });
    });

    function fillActivityCards(rows, idx, upcoming){
        actRoot.querySelectorAll('.hmActCard[data-csv]').forEach(function(card){
            var type = card.getAttribute('data-csv');
            var next = null, i;
            for (i = 0; i < upcoming.length; i++){ if (upcoming[i].type === type){ next = upcoming[i]; break; } }
            var label = card.querySelector('.hmActNext');
            if (next){
                label.textContent = T.nextPrefix + fmtDateWeekday(next.date);
                label.classList.remove('hmActNextNone');
            }
            // 原價：最近一場開放場次；沒有的話用該活動最後一列
            var price = next ? next.price : '';
            if (!price){
                for (i = rows.length - 1; i >= 1; i--){ if (rows[i][idx.type] === type && rows[i][idx.price]){ price = rows[i][idx.price]; break; } }
            }
            var priceEl = card.querySelector('.hmActPrice');
            if (price && priceEl){ priceEl.textContent = price.trim(); priceEl.hidden = false; }
        });
    }

    /* -------- 共用：抓一次場次 CSV，跑馬燈／場次卡／活動輪播共用 -------- */

    fetch(CSV_URL)
        .then(function(res){
            if (!res.ok) throw new Error('CSV fetch failed: ' + res.status);
            return res.text();
        })
        .then(function(text){
            var rows = parseCSV(text);
            if (!rows.length) throw new Error('Empty CSV');

            var header = rows[0];
            var idx = {
                type: header.indexOf(CFG.typeColumn),
                date: header.indexOf('場次日期'),
                status: header.indexOf('最終狀態（自動）'),
                form: header.indexOf('報名表單連結'),
                price: header.indexOf('原價'),
                tag: header.indexOf('報名狀態標籤')
            };
            if (idx.type < 0 || idx.date < 0 || idx.status < 0 || idx.price < 0){
                throw new Error('CSV missing expected columns');
            }

            var today = new Date();
            today.setHours(0, 0, 0, 0);

            var upcoming = rows.slice(1)
                .filter(function(r){ return r.length > idx.status && r[idx.status] === '開放中'; })
                .map(function(r){
                    return {
                        type: r[idx.type],
                        date: r[idx.date],
                        dateObj: toDate(r[idx.date]),
                        price: r[idx.price],
                        formLink: idx.form >= 0 ? r[idx.form] : '',
                        statusTag: idx.tag >= 0 ? r[idx.tag] : ''
                    };
                })
                .filter(function(r){ return !isNaN(r.dateObj.getTime()) && r.dateObj.getTime() > today.getTime(); })
                .sort(function(a, b){ return a.dateObj - b.dateObj; });

            fillActivityCards(rows, idx, upcoming);
            if (!upcoming.length) throw new Error('No upcoming open sessions');

            renderMarquee(upcoming);
            sessionGrid.innerHTML = upcoming.slice(0, SESSION_LIMIT).map(sessionCardHtml).join('');
            createCarousel(document.getElementById('sessionCarousel'));
        })
        .catch(function(){
            renderMarqueeStatic('<span class="marqueeItem">' + esc(T.marqueeFallback) + '</span>');
            // 沒有場次：顯示備援文字，不需要輪播控制
            document.getElementById('sessionCarousel').classList.add('hmStatic');
            sessionGrid.innerHTML = '<p class="sessionFallback hmSessionFallback">' + T.sessionFallbackHtml + '</p>';
        });

    /* -------- 參加者回饋：沒有網址／載入失敗／沒有可顯示的評論 → 整區維持 hidden -------- */

    var reviewsSection = document.getElementById('reviews');

    function loadReviews(){
        if (!REVIEWS_CSV_URL) return;
        fetch(REVIEWS_CSV_URL)
            .then(function(res){
                if (!res.ok) throw new Error('Reviews fetch failed: ' + res.status);
                return res.text();
            })
            .then(function(text){
                var rows = parseCSV(text);
                if (!rows.length) return;
                var header = rows[0].map(function(h){ return h.trim(); });
                var iShow = header.indexOf('顯示');
                var iName = header.indexOf('姓名縮寫');
                // 活動名稱：中文頁讀「活動」、英文頁讀「活動 EN」；欄位不存在或空白就不顯示，不拿另一語言頂替
                var iAct = header.indexOf(CFG.activityColumn);
                var iDate = header.indexOf('日期');
                var iText = header.indexOf(CFG.reviewColumn);
                if (iShow < 0 || iText < 0) return;

                var reviews = rows.slice(1).filter(function(r){
                    return (r[iShow] || '').trim().toUpperCase() === 'Y' && (r[iText] || '').trim() !== '';
                });
                if (!reviews.length) return;

                var root = document.getElementById('reviewCarousel');
                var track = root.querySelector('.hmCarTrack');
                reviews.forEach(function(r){
                    // 評論內容一律用 textContent 輸出，不經 innerHTML
                    var card = document.createElement('figure');
                    card.className = 'hmReview';
                    var quote = document.createElement('blockquote');
                    quote.className = 'hmReviewText';
                    quote.textContent = r[iText].trim();
                    card.appendChild(quote);
                    var more = document.createElement('button');
                    more.type = 'button';
                    more.className = 'hmReviewMore';
                    more.textContent = T.expand;
                    more.setAttribute('aria-expanded', 'false');
                    more.hidden = true;
                    more.addEventListener('click', function(){
                        var open = card.classList.toggle('is-open');
                        more.textContent = open ? T.collapse : T.expand;
                        more.setAttribute('aria-expanded', open ? 'true' : 'false');
                    });
                    card.appendChild(more);
                    var meta = document.createElement('figcaption');
                    meta.className = 'hmReviewMeta';
                    meta.textContent = [iName, iAct, iDate]
                        .map(function(i){ return i >= 0 ? (r[i] || '').trim() : ''; })
                        .filter(Boolean)
                        .join('・');
                    if (meta.textContent) card.appendChild(meta);
                    track.appendChild(card);
                });
                reviewsSection.hidden = false;

                // 超過 4 行才顯示「展開」：以行高換算（開頭引號字體較大，不能直接比 scrollHeight）
                [].forEach.call(track.querySelectorAll('.hmReview'), function(card){
                    var q = card.querySelector('.hmReviewText');
                    var lh = parseFloat(getComputedStyle(q).lineHeight) || 25;
                    if (q.scrollHeight > lh * 4 + lh / 2) card.querySelector('.hmReviewMore').hidden = false;
                });

                // 只有 1–2 則：靜態並排，不輪播
                if (reviews.length <= 2){
                    root.classList.add('hmStatic');
                } else {
                    createCarousel(root);
                }
            })
            .catch(function(){ /* 失敗時整區維持隱藏 */ });
    }
    loadReviews();

    /* -------- 活動照片集（全部照片，每頁 8 張輪播；順序依 manifest，已排開相似照片）＋燈箱 -------- */

    var gallerySection = document.getElementById('gallery');
    var galleryGrid = document.getElementById('galleryGrid');
    var lightbox = document.getElementById('lightbox');
    var lbImg = document.getElementById('lbImg');
    var lbCount = document.getElementById('lbCount');
    var galleryItems = [];
    var lbIndex = 0;
    var lbOpener = null;

    function altOf(item){ return isZh ? item.alt : item.alt_en; }

    function showLightbox(i){
        lbIndex = (i + galleryItems.length) % galleryItems.length;
        var item = galleryItems[lbIndex];
        lbImg.src = GALLERY_DIR + item.file;
        lbImg.alt = altOf(item);
        lbCount.textContent = (lbIndex + 1) + ' / ' + galleryItems.length;
    }

    function openLightbox(i, opener){
        lbOpener = opener;
        showLightbox(i);
        lightbox.hidden = false;
        document.body.style.overflow = 'hidden';
        document.getElementById('lbClose').focus();
    }

    function closeLightbox(){
        lightbox.hidden = true;
        document.body.style.overflow = '';
        if (lbOpener) lbOpener.focus();
    }

    fetch(GALLERY_DIR + 'manifest.json')
        .then(function(res){
            if (!res.ok) throw new Error('Manifest fetch failed: ' + res.status);
            return res.json();
        })
        .then(function(data){
            galleryItems = data.images || [];
            if (!galleryItems.length) return;
            var page;
            galleryItems.forEach(function(item, i){
                if (i % GALLERY_PAGE_SIZE === 0){
                    page = document.createElement('div');
                    page.className = 'hmGalleryPage';
                    galleryGrid.appendChild(page);
                }
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'hmGalleryItem';
                btn.setAttribute('aria-label', altOf(item));
                var img = document.createElement('img');
                img.loading = 'lazy';
                img.decoding = 'async';
                img.src = GALLERY_DIR + (item.thumb || item.file);
                img.alt = altOf(item);
                if (item.thumbWidth){ img.width = item.thumbWidth; img.height = item.thumbHeight; }
                btn.appendChild(img);
                btn.addEventListener('click', function(){ openLightbox(i, btn); });
                page.appendChild(btn);
            });
            gallerySection.hidden = false;
            // 輪播內的 lazy 圖片要滑到才會載入，會先閃一下空白；照片區接近畫面時再一次載入全部縮圖
            if ('IntersectionObserver' in window){
                var io = new IntersectionObserver(function(entries){
                    if (!entries[0].isIntersecting) return;
                    galleryGrid.querySelectorAll('img').forEach(function(img){ img.loading = 'eager'; });
                    io.disconnect();
                }, { rootMargin: '300px 0px' });
                io.observe(gallerySection);
            }
            var galleryRoot = document.getElementById('galleryCarousel');
            if (galleryItems.length > GALLERY_PAGE_SIZE) createCarousel(galleryRoot);
            else galleryRoot.classList.add('hmStatic');
        })
        .catch(function(){ /* 讀不到 manifest 時整區維持隱藏 */ });

    document.getElementById('lbPrev').addEventListener('click', function(){ showLightbox(lbIndex - 1); });
    document.getElementById('lbNext').addEventListener('click', function(){ showLightbox(lbIndex + 1); });
    document.getElementById('lbClose').addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', function(e){ if (e.target === lightbox) closeLightbox(); });
    document.addEventListener('keydown', function(e){
        if (lightbox.hidden) return;
        if (e.key === 'Escape') closeLightbox();
        else if (e.key === 'ArrowLeft') showLightbox(lbIndex - 1);
        else if (e.key === 'ArrowRight') showLightbox(lbIndex + 1);
    });
    // 手機滑動切換
    var touchX = null;
    lightbox.addEventListener('touchstart', function(e){ touchX = e.changedTouches[0].clientX; }, { passive: true });
    lightbox.addEventListener('touchend', function(e){
        if (touchX === null) return;
        var dx = e.changedTouches[0].clientX - touchX;
        touchX = null;
        if (Math.abs(dx) > 40) showLightbox(lbIndex + (dx < 0 ? 1 : -1));
    });

    /* -------- 手機浮動 LINE 按鈕：頁尾進入畫面時隱藏，避免遮住頁尾 -------- */

    var floatLine = document.getElementById('floatLine');
    var footer = document.querySelector('.Footer');
    if (floatLine && footer && 'IntersectionObserver' in window){
        new IntersectionObserver(function(entries){
            floatLine.classList.toggle('hmFloatHidden', entries[0].isIntersecting);
        }).observe(footer);
    }
})();
