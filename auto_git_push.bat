@echo off
REM Script para subir cambios automáticamente a GitHub

REM Mensaje para el commit, puedes cambiarlo como quieras
set /p COMMIT_MSG=Ingresa mensaje de commit: 

REM Ir a la carpeta del proyecto (asegúrate de cambiar la ruta si es otra)
cd /d D:\Proyectos\Extension Mangayomi

REM Mostrar estado
git status

REM Agregar todos los cambios
git add .

REM Hacer commit
git commit -m "%COMMIT_MSG%"

REM Subir al repositorio remoto
git push origin master

pause
