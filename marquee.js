/* Shared "upcoming sessions" marquee, used by every page except the home
   pages (index.html / homeZN/index.html), which keep their own inline copy
   because they also drive the "Upcoming Sessions" card row from the same
   CSV fetch. Language is picked from the URL path (pages with "ZN" in the
   path are Chinese) rather than <html lang>, because a handful of ZN pages
   have that attribute set incorrectly to "en". */
(function(){
    var marqueeBar = document.getElementById('marqueeBar');
    var marqueeTrack = document.getElementById('marqueeTrack');
    if (!marqueeBar || !marqueeTrack) return;

    var isZH = window.location.pathname.indexOf('ZN') >= 0;
    var MARQUEE_FALLBACK = isZH
        ? '零基礎友善・專業嚮導全程陪同・1:6 小團制・保險保障'
        : 'Beginner Friendly · Professional Guides Throughout · Small Groups (Max 1:6) · Fully Insured';
    var CSV_URL = 'https://docs.google.com/spreadsheets/d/1VvRRgURxwP4ka_it5MCn96JD6XzbjKS6CGEnWYE_afU/export?format=csv&gid=0';
    var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    function esc(s){
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // Simple but correct CSV parser that handles quoted commas/newlines
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

    function fmtDateShort(dstr){
        var d = new Date(dstr + 'T00:00:00');
        if (isNaN(d.getTime())) return dstr;
        return isZH ? (d.getMonth() + 1) + '/' + d.getDate() : MONTHS[d.getMonth()] + ' ' + d.getDate();
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

    function marqueePriceHtml(r){
        var cur = (r.currentPrice || '').trim();
        if (cur === '免費') return isZH ? '免費參加' : 'Free';
        return esc(cur);
    }

    function marqueeItemHtml(r){
        var label = esc(fmtDateShort(r.date)) + ' ' + esc(r.type) + '・';
        var href = r.formLink ? esc(withSessionDateParam(r.formLink, r.date)) : '#';
        return '<a class="marqueeItem" href="' + href + '" target="_blank" rel="noopener">' +
            label + marqueePriceHtml(r) + '</a>';
    }

    function renderMarqueeStatic(html){
        marqueeBar.classList.add('marqueeStatic');
        marqueeTrack.innerHTML = html;
    }

    function renderMarquee(list){
        var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var sep = '<span class="marqueeSep" aria-hidden="true">◆</span>';
        var htmlOnce = list.slice(0, 5).map(function(r){
            return marqueeItemHtml(r) + sep;
        }).join('');
        if (reduceMotion){
            renderMarqueeStatic(htmlOnce);
        } else {
            marqueeTrack.innerHTML = htmlOnce + htmlOnce;
        }
    }

    function showMarqueeFallback(){
        renderMarqueeStatic('<span class="marqueeItem">' + esc(MARQUEE_FALLBACK) + '</span>');
    }

    // .StickyTop is fixed, so it takes page content up to it; each page's
    // own CSS already clears the header's height, this only adds however
    // tall the marquee bar itself renders (measured, not hard-coded, so it
    // stays correct across every page template and viewport width).
    function syncBodyPadding(){
        document.body.style.paddingTop = marqueeBar.offsetHeight + 'px';
    }

    syncBodyPadding();
    window.addEventListener('resize', syncBodyPadding);

    fetch(CSV_URL)
        .then(function(res){
            if (!res.ok) throw new Error('CSV fetch failed: ' + res.status);
            return res.text();
        })
        .then(function(text){
            var rows = parseCSV(text);
            if (!rows.length) throw new Error('Empty CSV');

            var header = rows[0];
            var iType = header.indexOf(isZH ? '活動類型' : '活動類型 EN');
            var iDate = header.indexOf('場次日期');
            var iStatus = header.indexOf('最終狀態（自動）');
            var iForm = header.indexOf('報名表單連結');
            var iPrice = header.indexOf('原價');
            if (iType < 0 || iDate < 0 || iStatus < 0 || iPrice < 0){
                throw new Error('CSV missing expected columns');
            }

            var today = new Date();
            today.setHours(0, 0, 0, 0);

            var upcoming = rows.slice(1)
                .filter(function(r){ return r.length > iStatus && r[iStatus] === '開放中'; })
                .map(function(r){
                    var d = new Date(r[iDate] + 'T00:00:00');
                    return {
                        type: r[iType],
                        date: r[iDate],
                        dateObj: d,
                        currentPrice: r[iPrice],
                        formLink: iForm >= 0 ? r[iForm] : ''
                    };
                })
                .filter(function(r){ return !isNaN(r.dateObj.getTime()) && r.dateObj.getTime() > today.getTime(); })
                .sort(function(a, b){ return a.dateObj - b.dateObj; });

            if (!upcoming.length) throw new Error('No upcoming open sessions');

            renderMarquee(upcoming);
            syncBodyPadding();
        })
        .catch(function(){
            showMarqueeFallback();
            syncBodyPadding();
        });
})();
