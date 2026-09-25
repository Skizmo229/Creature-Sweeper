@echo off
rem Double-click to play the checked-out code: builds it, zips it into release/
rem and opens it in the browser. Close this window to stop the server.
cd /d "%~dp0.."
call npm run playtest
if errorlevel 1 pause
