@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title EdgeML Launcher

echo ==============================================
echo   Room State / Edge ML - starting all services
echo ==============================================

rem ---------- 1. Prerequisites ----------
where node >nul 2>&1 || (echo [ERROR] Node.js not found. Install it from https://nodejs.org/ & pause & exit /b 1)
where npm >nul 2>&1 || (echo [ERROR] npm not found. Reinstall Node.js. & pause & exit /b 1)

set "MOSQ="
if exist "C:\Program Files\mosquitto\mosquitto.exe" set "MOSQ=C:\Program Files\mosquitto\mosquitto.exe"
if not defined MOSQ for /f "delims=" %%i in ('where mosquitto 2^>nul') do if not defined MOSQ set "MOSQ=%%i"
if not defined MOSQ (
  echo [ERROR] Mosquitto not found. Install it from https://mosquitto.org/download/
  pause & exit /b 1
)
set "MOSQ_DIR=" & for %%i in ("%MOSQ%") do set "MOSQ_DIR=%%~dpi"

rem ---------- 2. Firewall rules for 1883 / 9001 (needs admin once) ----------
netsh advfirewall firewall show rule name="Mosquitto MQTT 1883" >nul 2>&1
if errorlevel 1 (
  net session >nul 2>&1
  if errorlevel 1 (
    echo [WARN] Firewall rules for ports 1883/9001 are missing. The ESP32 may not reach the broker.
    echo        Re-run this file once as Administrator to add them.
  ) else (
    echo Adding firewall rules for 1883 and 9001...
    netsh advfirewall firewall add rule name="Mosquitto MQTT 1883" dir=in action=allow protocol=TCP localport=1883 >nul
    netsh advfirewall firewall add rule name="Mosquitto WebSockets 9001" dir=in action=allow protocol=TCP localport=9001 >nul
  )
)

rem ---------- 3. MQTT broker ----------
netstat -ano | findstr /r /c:":1883 .*LISTENING" >nul
if not errorlevel 1 (
  echo Broker already listening on 1883 - not starting another one.
  netstat -ano | findstr /r /c:":9001 .*LISTENING" >nul || echo [WARN] Nothing on 9001: the running broker has no WebSockets listener, so the dashboard cannot connect.
) else (
  echo Starting Mosquitto...
  start "EdgeML Mosquitto" /d "%~dp0broker" "%MOSQ%" -c mosquitto.conf -v
)

rem ---------- 4. Dashboard dependencies + dev server ----------
if not exist "dashboard\node_modules" (
  echo Installing dashboard dependencies, first run only...
  pushd dashboard
  call npm install || (popd & echo [ERROR] npm install failed. & pause & exit /b 1)
  popd
)
netstat -ano | findstr /r /c:":5173 .*LISTENING" >nul
if not errorlevel 1 (
  echo Dashboard already running on port 5173.
) else (
  echo Starting dashboard dev server...
  start "EdgeML Dashboard" /d "%~dp0dashboard" cmd /k npm run dev -- --port 5173 --strictPort
)

rem ---------- 5. Live MQTT monitor window ----------
if exist "%MOSQ_DIR%mosquitto_sub.exe" (
  start "EdgeML Monitor" cmd /k ""%MOSQ_DIR%mosquitto_sub.exe" -h localhost -t "edgeml/room/#" -v"
)

rem ---------- 6. Wait for the dev server, then open the browser ----------
echo Waiting for dashboard...
set /a tries=0
:wait
netstat -ano | findstr /r /c:":5173 .*LISTENING" >nul && goto ready
set /a tries+=1
if !tries! geq 30 (echo [WARN] Dashboard did not come up in 30 s - check the EdgeML Dashboard window. & goto done)
timeout /t 1 /nobreak >nul
goto wait
:ready
start "" http://localhost:5173

:done
echo.
echo Services:  Mosquitto 1883/9001  ^|  Dashboard http://localhost:5173  ^|  MQTT monitor window
echo ESP32 MQTT_HOST should be one of these laptop IPs:
ipconfig | findstr /c:"IPv4"
echo.
echo Run stop-dashboard.bat to stop everything.
endlocal
