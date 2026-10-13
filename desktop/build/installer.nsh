; Extra pages for the Windows installer (electron-builder includes this file;
; see "include" under "nsis" in package.json).

; A welcome page with the Lodestar side panel (build/installerSidebar.bmp).
; electron-builder's installer has no welcome page unless one is added here.
!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to AQW Lodestar"
  !define MUI_WELCOMEPAGE_TEXT "This installs AQW Lodestar on your computer: the server boosts, Check bag and your farm list in a small window that can stay on top of the game.$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_PAGE_WELCOME
!macroend
