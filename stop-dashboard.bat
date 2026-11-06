@echo off
setlocal

echo Stopping dashboard dev server...
taskkill /fi "WINDOWTITLE eq EdgeML Dashboard*" /t /f >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":5173 .*LISTENING"') do taskkill /pid %%p /t /f >nul 2>&1

echo Stopping MQTT monitor...
taskkill /fi "WINDOWTITLE eq EdgeML Monitor*" /t /f >nul 2>&1

echo Stopping Mosquitto - only the window started by start-dashboard.bat...
taskkill /fi "WINDOWTITLE eq EdgeML Mosquitto*" /t /f >nul 2>&1

echo Done.
endlocal
