@echo off
REM ===============================
REM Script automático para subir cambios a GitHub
REM ===============================

REM Carpeta del proyecto (cambia si tu ruta es distinta)
cd /d D:\Proyectos\Extension Mangayomi

REM Mostrar estado de Git
git status

REM Agregar todos los cambios respetando .gitignore
git add .

REM Verificar si hay cambios para commit
git diff --cached --quiet
if %errorlevel%==0 (
    echo No hay cambios para subir. ¡Listo!
    pause
    exit /b
)

REM Crear mensaje de commit con fecha y hora
for /f "tokens=1-5 delims=/: " %%d in ("%date% %time%") do (
    set YYYY=%%f
    set MM=%%d
    set DD=%%e
    set HH=%%g
    set MIN=%%h
)
set COMMIT_MSG=Auto-commit %YYYY%-%MM%-%DD%_%HH%-%MIN%

REM Hacer commit
git commit -m "%COMMIT_MSG%"

REM Subir al repositorio remoto
git push origin master

echo.
echo ===============================
echo ¡Subida automática completada!
echo ===============================
pause
