Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
Set wmi = GetObject("winmgmts:\\.\root\cimv2")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
botPath = LCase(fso.BuildPath(scriptDir, "bot.py"))

For Each proc In wmi.ExecQuery("SELECT * FROM Win32_Process WHERE Name='python.exe' OR Name='pythonw.exe'")
    On Error Resume Next
    cmdLine = LCase(proc.CommandLine & "")
    If InStr(cmdLine, botPath) > 0 Or InStr(cmdLine, " bot.py") > 0 Or InStr(cmdLine, """bot.py""") > 0 Then
        proc.Terminate
    End If
    On Error GoTo 0
Next

WScript.Sleep 1500
command = "cmd /c cd /d """ & scriptDir & """ && python """ & botPath & """"
shell.Run command, 0, False
