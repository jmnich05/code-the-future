Pill segmented control for switching between a few views; active pill fills brand blue.

```jsx
<Tabs
  defaultValue="platform"
  tabs={[
    { value: 'platform', label: 'Platform' },
    { value: 'camp', label: 'Summer Camp' },
  ]}
  onChange={(v) => setView(v)}
/>
```

Works controlled (`value` + `onChange`) or uncontrolled (`defaultValue`). Each tab: `{ value, label, icon? }`.
