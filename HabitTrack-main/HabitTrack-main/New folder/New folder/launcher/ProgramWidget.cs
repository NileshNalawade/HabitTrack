using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

namespace HabitTrackWidget
{
    class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string indexPath = Path.Combine(baseDir, "index.html");
                if (!File.Exists(indexPath))
                {
                    MessageBox.Show("Could not find index.html at:\n" + indexPath, "HabitTrack Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                string url = "file:///" + indexPath.Replace('\\', '/') + "#widgets";
                string windowSize = "--window-size=430,760";
                string userDataDir = Path.Combine(Path.GetTempPath(), "HabitTrack_Widget_UserData");

                string[] candidates = new string[]
                {
                    @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                    @"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
                    @"C:\Program Files\Google\Chrome\Application\chrome.exe",
                    @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
                };

                string browserExe = null;
                foreach (string path in candidates)
                {
                    if (File.Exists(path))
                    {
                        browserExe = path;
                        break;
                    }
                }

                if (browserExe == null)
                {
                    Process.Start(url);
                    return;
                }

                string appArgs = string.Format("--app=\"{0}\" {1} --user-data-dir=\"{2}\" --allow-file-access-from-files --enable-local-file-accesses --disable-web-security --no-first-run --no-default-browser-check", url, windowSize, userDataDir);
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = browserExe;
                psi.Arguments = appArgs;
                psi.UseShellExecute = false;

                Process.Start(psi);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Error launching HabitTrack Widget: " + ex.Message, "HabitTrack", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}
