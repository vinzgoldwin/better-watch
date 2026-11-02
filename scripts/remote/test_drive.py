import importlib.util
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import call, mock_open, patch

spec = importlib.util.spec_from_file_location('drive', Path(__file__).with_name('drive.py'))
drive = importlib.util.module_from_spec(spec)
spec.loader.exec_module(drive)

class MountTests(unittest.TestCase):
    def setUp(self):
        for mocked in (
            patch.object(drive.Path, 'exists', return_value=True),
            patch('builtins.open', mock_open()),
            patch.object(drive.fcntl, 'flock'),
            patch.object(drive.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, stdout='')),
        ):
            mocked.start()
            self.addCleanup(mocked.stop)

    def test_repair_is_not_an_available_operation(self):
        with patch.object(sys, 'argv', ['drive', 'repair']), patch.object(drive, 'run') as run:
            with self.assertRaisesRegex(ValueError, 'Only the mount'):
                drive.main()
            run.assert_not_called()

    def test_connect_restores_mount_before_waking_the_known_drive(self):
        with patch.object(sys, 'argv', ['drive', 'wake']), patch.object(drive, 'run', return_value='3027-844B') as run:
            drive.main()
            self.assertEqual(run.call_args_list, [
                call('/usr/bin/blkid', '-s', 'UUID', '-o', 'value', drive.PART),
                call('/usr/bin/systemctl', 'start', r'Volumes-Ultra\x20Touch.mount'),
                call('/usr/bin/dd', 'if=' + drive.DRIVE, 'of=/dev/null', 'bs=4096', 'count=1', 'iflag=direct', 'status=none'),
            ])

    def test_failed_mount_is_reported_instead_of_successful_wake(self):
        failure = subprocess.CalledProcessError(1, 'systemctl', stderr='Mount failed')
        with patch.object(sys, 'argv', ['drive', 'wake']), patch.object(drive, 'run', side_effect=['3027-844B', failure]) as run:
            with self.assertRaises(subprocess.CalledProcessError):
                drive.main()
            self.assertFalse(any(args[0][0] == '/usr/bin/dd' for args in run.call_args_list))

    def test_missing_drive_cannot_be_woken(self):
        with patch.object(sys, 'argv', ['drive', 'wake']), patch.object(drive.Path, 'exists', return_value=False), patch.object(drive, 'run') as run:
            with self.assertRaisesRegex(ValueError, 'not connected'):
                drive.main()
            run.assert_not_called()

    def test_wrong_volume_is_rejected(self):
        with patch.object(sys, 'argv', ['drive', 'mount']), patch.object(drive, 'run', return_value='wrong-uuid'):
            with self.assertRaisesRegex(ValueError, 'Expected Ultra Touch'):
                drive.main()

    def test_existing_mount_must_be_the_expected_device(self):
        with patch.object(sys, 'argv', ['drive', 'mount']), patch.object(drive, 'run', return_value='3027-844B'), patch.object(drive.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, stdout='/dev/unrelated')):
            with self.assertRaisesRegex(ValueError, 'another device'):
                drive.main()

if __name__ == '__main__':
    unittest.main()
