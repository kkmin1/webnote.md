Set shell = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
botPath = CreateObject("Scripting.FileSystemObject").BuildPath(scriptDir, "bot.py")
command = "cmd /c cd /d """ & scriptDir & """ && python """ & botPath & """"
shell.Run command, 0, False
