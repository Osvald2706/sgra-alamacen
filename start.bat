@echo off
chcp 65001 >nul
title SGRA - Servidor Local
echo =============================================
echo  SGRA - Prueba Local
echo =============================================
echo.
echo Abre tu navegador en: http://localhost:8000
echo.
echo Para USO EN PRODUCCION mejor usa Railway:
echo https://railway.com
echo.
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
pause
