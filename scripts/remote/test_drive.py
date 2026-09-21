import importlib.util
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import mock_open, patch

spec = importlib.util.spec_from_file_location('drive', Path(__file__).with_name('drive.py'))
drive = importlib.util.module_from_spec(spec)
spec.loader.exec_module(drive)

class MountTests(unittest.TestCase):
    def test_repair_is_not_an_available_operation(self):
        with patch.object(sys, 'argv', ['drive', 'repair']), patch.object(drive, 'run') as run:
            with self.assertRaisesRegex(ValueError, 'Only the mount'):
                drive.main()
            run.assert_not_called()

    def test_wake_uses_only_an_uncached_read_of_the_known_drive(self):
        with patch.object(sys, 'argv', ['drive', 'wake']), patch.object(drive.Path, 'exists', return_value=True), patch('builtins.open', mock_open()), patch.object(drive.fcntl, 'flock'), patch.object(drive, 'run') as run:
            drive.main()
            run.assert_called_once_with('/usr/bin/dd', 'if=' + drive.DRIVE, 'of=/dev/null', 'bs=4096', 'count=1', 'iflag=direct', 'status=none')

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
