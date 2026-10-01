#!/bin/sh
# Playwright MCP 런처. 사전 설치된 Chromium이 있는 환경(클라우드 세션 등)은 npm 레지스트리 없이
# 전역 playwright의 내장 MCP 서버를 쓰고, 아니면 @playwright/mcp를 npx로 받는다.
if [ -x /opt/pw-browsers/chromium ] && command -v playwright >/dev/null 2>&1; then
  exec playwright run-mcp-server --headless --no-sandbox --executable-path /opt/pw-browsers/chromium
fi
exec npx -y @playwright/mcp@latest --headless --browser chromium
