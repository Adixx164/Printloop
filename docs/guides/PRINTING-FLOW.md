# PrintLoop — Printing Flow

```mermaid
flowchart TD
    A[Customer opens app] --> B[Map shows nearby print shops]
    B --> C[Customer selects a shop]
    C --> D[Shop services & transparent pricing shown]
    D --> E{Choose print mode}
    
    E -->|Single| F[Upload one file]
    E -->|Batch| G[Upload multiple files at once]
    E -->|Group| H[Upload file, invite others to add theirs]
    
    F --> I[Customize: paper, size, color, finish]
    G --> I
    H --> I
    
    I --> J[Preview generated]
    J --> K{Satisfied?}
    K -->|No| I
    K -->|Yes| L[Pay online]
    
    L --> M[Get authentication code]
    M --> N[Order sent to shop]
    
    N --> O[Shop receives job in queue]
    O --> P[Shop prints job]
    P --> Q[Job ready for pickup]
    Q --> R[Customer shows auth code]
    R --> S[Shop verifies & hands over]
    S --> T[Done]
    
    T --> U{Leave review?}
    U -->|Yes| V[Rate shop & service]
    U -->|No| W[End]
    V --> W
```

## Simplified linear version

```
Open App → Map → Select Shop → See Services & Pricing
    → Choose Mode (Single/Batch/Group) → Upload File(s)
    → Customize → Preview → Pay → Get Auth Code
    → Order Sent → Shop Prints → Pickup + Verify → Review
```

## Print Mode Options

| Mode | Use Case |
|------|----------|
| Single | One file, one-off print job |
| Batch | Multiple files in one order |
| Group | One starter file, others contribute |
