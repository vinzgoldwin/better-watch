import React from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { Check, ChevronDown } from 'lucide-react';

export function CategoryPicker({ value, options, onChange }) {
  // Keep selections visible even when another filter reduces their count to zero.
  const items = [...options];
  for (const selected of value) {
    if (!items.some((item) => item.value === selected.value)) items.push({ ...selected, count: 0 });
  }
  const label = value.length === 0 ? 'All categories' : value.length === 1 ? value[0].label : `${value.length} categories`;
  return (
    <div className="select category-filter">
      <span>Categories</span>
      <Combobox.Root multiple items={items} value={value} onValueChange={onChange}
        itemToStringLabel={(item) => item.label}
        isItemEqualToValue={(a, b) => a.value === b.value}
        filter={(item, query) => item.label.toLowerCase().includes(query.trim().toLowerCase())}>
        <Combobox.Trigger className="app-select-trigger app-select-control" aria-label="Categories" title={value.map((item) => item.label).join(', ') || label}>
          <span className="app-select-value">{label}</span>
          <ChevronDown className="folder-picker-chevron" aria-hidden="true" />
        </Combobox.Trigger>
        <Combobox.Portal>
          <Combobox.Positioner className="app-select-positioner" sideOffset={8} align="start">
            <Combobox.Popup className="app-select-content folder-picker-popup category-picker-popup">
              <div className="category-picker-actions">
                <Combobox.Input className="folder-picker-search" aria-label="Find a category" placeholder="Find a category…" />
                <button type="button" disabled={!value.length} onClick={() => onChange([])}>Clear</button>
              </div>
              <Combobox.Empty className="folder-picker-empty">No matching categories.</Combobox.Empty>
              <Combobox.List className="folder-picker-list">
                {(option) => (
                  <Combobox.Item key={option.value} value={option} className="app-select-item folder-picker-item category-picker-item">
                    <span className="category-check"><Combobox.ItemIndicator><Check aria-hidden="true" /></Combobox.ItemIndicator></span>
                    <span className="folder-picker-path">{option.label}</span>
                    <span className="folder-picker-count">{option.count}</span>
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
