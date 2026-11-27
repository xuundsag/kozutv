@echo off
title kozuTV Discord helper setup
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0START-RELAY-WINDOWS.ps1"
if errorlevel 1 pause
