# 스크롤 감사 (변경 전)

`node tools/tests/no-scroll.cjs --audit` — 스크롤 = overflow auto/scroll이고 내용이 넘침 · 잘림 = overflow hidden으로 가려진 넘침(참고).

| 해상도 | 화면·상태 | 요소 | overflow | 넘친 세로px | 넘친 가로px | 종류 |
|---|---|---|---|---|---|---|
| 1920x1080 | round-result | #overlayBox.overlay-box.px-panel-gold | auto/auto | 482 | 0 | 스크롤 |
| 1920x1080 | reward-card | #overlayBox.overlay-box.px-panel-gold | auto/auto | 35 | 0 | 스크롤 |
| 1920x1080 | reward-upgrade | .deck-list | auto/auto | 1194 | 0 | 스크롤 |
| 1920x1080 | reward-remove | .deck-list | auto/auto | 1194 | 0 | 스크롤 |
| 1920x1080 | relic-swap | #overlayBox.overlay-box.px-panel-gold | auto/auto | 586 | 0 | 스크롤 |
| 1920x1080 | shop | #screen-shop.screen.active.haze-in | auto/auto | 3353 | 0 | 스크롤 |
| 1920x1080 | shop-pack-info | #screen-shop.screen.active.haze-in | auto/auto | 2852 | 0 | 스크롤 |
| 1920x1080 | shop-pack-info | #overlayBox.overlay-box.px-panel-gold | auto/auto | 2439 | 0 | 스크롤 |
| 1920x1080 | shop-pack-open | #screen-shop.screen.active | auto/auto | 2852 | 0 | 스크롤 |
| 1920x1080 | deck | #overlayBox.overlay-box.px-panel-gold | auto/auto | 842 | 0 | 스크롤 |
| 1920x1080 | deck | .deck-list | auto/auto | 2874 | 0 | 스크롤 |
| 1920x1080 | deck | .deck-list | auto/auto | 1194 | 0 | 스크롤 |
| 1920x1080 | deck | .deck-list | auto/auto | 354 | 0 | 스크롤 |
| 1920x1080 | glossary | #glossList.gloss-list | auto/auto | 6585 | 0 | 스크롤 |
| 1920x1080 | sector-levels | #overlayBox.overlay-box.px-panel-gold | auto/auto | 194 | 0 | 스크롤 |
| 1920x1080 | records | #screen-records.screen.active | auto/auto | 3578 | 0 | 스크롤 |
| 1920x1080 | settings | #screen-settings.screen.active | auto/auto | 1021 | 0 | 스크롤 |
| 1920x1080 | collection | #screen-collection.screen.active | auto/auto | 11298 | 0 | 스크롤 |
| 1280x800 | round-result | #overlayBox.overlay-box.px-panel-gold | auto/auto | 319 | 0 | 스크롤 |
| 1280x800 | reward-upgrade | .deck-list | auto/auto | 840 | 0 | 스크롤 |
| 1280x800 | reward-remove | .deck-list | auto/auto | 840 | 0 | 스크롤 |
| 1280x800 | relic-swap | #overlayBox.overlay-box.px-panel-gold | auto/auto | 437 | 0 | 스크롤 |
| 1280x800 | shop | #screen-shop.screen.active.haze-in | auto/auto | 2325 | 0 | 스크롤 |
| 1280x800 | shop-pack-info | #screen-shop.screen.active.haze-in | auto/auto | 1990 | 0 | 스크롤 |
| 1280x800 | shop-pack-info | #overlayBox.overlay-box.px-panel-gold | auto/auto | 1716 | 0 | 스크롤 |
| 1280x800 | shop-pack-open | #screen-shop.screen.active | auto/auto | 2034 | 0 | 스크롤 |
| 1280x800 | deck | #overlayBox.overlay-box.px-panel-gold | auto/auto | 615 | 0 | 스크롤 |
| 1280x800 | deck | .deck-list | auto/auto | 2040 | 0 | 스크롤 |
| 1280x800 | deck | .deck-list | auto/auto | 840 | 0 | 스크롤 |
| 1280x800 | deck | .deck-list | auto/auto | 240 | 0 | 스크롤 |
| 1280x800 | glossary | #glossList.gloss-list | auto/auto | 4653 | 0 | 스크롤 |
| 1280x800 | sector-levels | #overlayBox.overlay-box.px-panel-gold | auto/auto | 113 | 0 | 스크롤 |
| 1280x800 | records | #screen-records.screen.active | auto/auto | 2567 | 0 | 스크롤 |
| 1280x800 | settings | #screen-settings.screen.active | auto/auto | 701 | 0 | 스크롤 |
| 1280x800 | collection | #screen-collection.screen.active | auto/auto | 8638 | 0 | 스크롤 |
| 1280x720 | round-result | #overlayBox.overlay-box.px-panel-gold | auto/auto | 393 | 0 | 스크롤 |
| 1280x720 | reward-card | #overlayBox.overlay-box.px-panel-gold | auto/auto | 74 | 0 | 스크롤 |
| 1280x720 | reward-upgrade | .deck-list | auto/auto | 877 | 0 | 스크롤 |
| 1280x720 | reward-remove | .deck-list | auto/auto | 877 | 0 | 스크롤 |
| 1280x720 | relic-swap | #overlayBox.overlay-box.px-panel-gold | auto/auto | 511 | 0 | 스크롤 |
| 1280x720 | shop | #screen-shop.screen.active.haze-in | auto/auto | 2449 | 0 | 스크롤 |
| 1280x720 | shop-pack-info | #screen-shop.screen.active.haze-in | auto/auto | 2070 | 0 | 스크롤 |
| 1280x720 | shop-pack-info | #overlayBox.overlay-box.px-panel-gold | auto/auto | 1790 | 0 | 스크롤 |
| 1280x720 | shop-pack-open | #screen-shop.screen.active | auto/auto | 2048 | 0 | 스크롤 |
| 1280x720 | deck | #overlayBox.overlay-box.px-panel-gold | auto/auto | 579 | 0 | 스크롤 |
| 1280x720 | deck | .deck-list | auto/auto | 2077 | 0 | 스크롤 |
| 1280x720 | deck | .deck-list | auto/auto | 877 | 0 | 스크롤 |
| 1280x720 | deck | .deck-list | auto/auto | 277 | 0 | 스크롤 |
| 1280x720 | glossary | #glossList.gloss-list | auto/auto | 4653 | 0 | 스크롤 |
| 1280x720 | signal-guide | #overlayBox.overlay-box.px-panel-gold | auto/auto | 26 | 0 | 스크롤 |
| 1280x720 | sector-levels | #overlayBox.overlay-box.px-panel-gold | auto/auto | 187 | 0 | 스크롤 |
| 1280x720 | records | #screen-records.screen.active | auto/auto | 2647 | 0 | 스크롤 |
| 1280x720 | settings | #screen-settings.screen.active | auto/auto | 781 | 0 | 스크롤 |
| 1280x720 | collection | #screen-collection.screen.active | auto/auto | 8718 | 0 | 스크롤 |
