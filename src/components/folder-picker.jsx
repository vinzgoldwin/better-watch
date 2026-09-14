import React from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { Check, ChevronDown } from 'lucide-react';
import { filterFolderOption } from '../lib/folders.js';

export function FolderPicker({ value, options, onChange }) {
  const selected = options.find((option) => option.value === value) || options[0];
  return (
    <div className="select subfolder">
      <span>Subfolder</span>
      <Combobox.Root items={options} value={selected} onValueChange={(option) => {
        if (option) onChange(option.value);
      }} isItemEqualToValue={(a, b) => a.value === b.value} filter={filterFolderOption}>
        <Combobox.Trigger className="app-select-trigger app-select-control" aria-label="Subfolder" title={selected.label}>
          <span className="app-select-value">{selected.label} ({selected.count})</span>
          <ChevronDown className="folder-picker-chevron" aria-hidden="true" />
        </Combobox.Trigger>
        <Combobox.Portal>
          <Combobox.Positioner className="app-select-positioner" sideOffset={8} align="start">
            <Combobox.Popup className="app-select-content folder-picker-popup">
              <Combobox.Input className="folder-picker-search" aria-label="Find a folder" placeholder="Find a folder…" />
              <Combobox.Empty className="folder-picker-empty">No matching folders.</Combobox.Empty>
              <Combobox.List className="folder-picker-list">
                {(option) => (
                  <Combobox.Item key={option.value} value={option} className="app-select-item folder-picker-item">
                    <span className="folder-picker-path">{option.label}</span>
                    <span className="folder-picker-count">{option.count}</span>
                    <span className="app-select-item-indicator">
                      <Combobox.ItemIndicator><Check aria-hidden="true" /></Combobox.ItemIndicator>
                    </span>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    </div>
  );
}
