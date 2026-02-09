-- RBAC production tables: app_user, roles, permissions, mappings
-- Creates application user accounts and RBAC tables (no test schema)

-- Ensure extension for uuid/bigserial use
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================
-- Production RBAC schema
-- =========================================

-- app_user table
CREATE TABLE IF NOT EXISTS app_user (
    user_id        BIGSERIAL PRIMARY KEY,
    username       VARCHAR(100) NOT NULL UNIQUE,
    email          VARCHAR(150) NOT NULL UNIQUE,
    password_hash  TEXT NOT NULL,

    first_name     VARCHAR(100),
    last_name      VARCHAR(100),

    status         VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, INACTIVE, LOCKED
    last_login     TIMESTAMP,

    failed_attempts INT DEFAULT 0,
    locked_until    TIMESTAMP,

    is_deleted     BOOLEAN DEFAULT FALSE,

    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by     BIGINT,
    updated_at     TIMESTAMP,
    updated_by     BIGINT
);

-- roles
CREATE TABLE IF NOT EXISTS roles (
    role_id     BIGSERIAL PRIMARY KEY,
    role_name   VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permissions (
    permission_id   BIGSERIAL PRIMARY KEY,
    permission_name VARCHAR(150) NOT NULL UNIQUE,
    module_name     VARCHAR(100),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_role_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    role_id BIGINT NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_userroles_user
        FOREIGN KEY (user_id)
        REFERENCES app_user(user_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_userroles_role
        FOREIGN KEY (role_id)
        REFERENCES roles(role_id)
        ON DELETE CASCADE,
    CONSTRAINT uq_user_role UNIQUE (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_permission_id BIGSERIAL PRIMARY KEY,
    role_id       BIGINT NOT NULL,
    permission_id BIGINT NOT NULL,
    assigned_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_roleperm_role
        FOREIGN KEY (role_id)
        REFERENCES roles(role_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_roleperm_permission
        FOREIGN KEY (permission_id)
        REFERENCES permissions(permission_id)
        ON DELETE CASCADE,
    CONSTRAINT uq_role_permission UNIQUE (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_permissions (
    user_permission_id BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL,
    permission_id BIGINT NOT NULL,
    assigned_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_userperm_user
        FOREIGN KEY (user_id)
        REFERENCES app_user(user_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_userperm_permission
        FOREIGN KEY (permission_id)
        REFERENCES permissions(permission_id)
        ON DELETE CASCADE,
    CONSTRAINT uq_user_permission UNIQUE (user_id, permission_id)
);

-- refresh_token table for JWT tokens
CREATE TABLE IF NOT EXISTS refresh_token (
    token_id   BIGSERIAL PRIMARY KEY,
    token      TEXT NOT NULL UNIQUE,
    user_id    BIGINT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    revoked    BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_refreshtoken_user
        FOREIGN KEY (user_id)
        REFERENCES app_user(user_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_userroles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_userroles_role ON user_roles(role_id);

CREATE INDEX IF NOT EXISTS idx_roleperm_role ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_roleperm_perm ON role_permissions(permission_id);

CREATE INDEX IF NOT EXISTS idx_refreshtoken_user ON refresh_token(user_id);
CREATE INDEX IF NOT EXISTS idx_refreshtoken_token ON refresh_token(token);

-- End of RBAC tables
-- Default roles
INSERT INTO roles (role_name, description) VALUES
('ADMIN',   'System Administrator'),
('MANAGER', 'IT Manager'),
('AGENT',   'Support Agent'),
('USER',    'End User')
ON CONFLICT (role_name) DO NOTHING;

-- Default permissions
INSERT INTO permissions (permission_name, module_name) VALUES
('MANAGE_USERS',  'User'),
('CREATE_TICKET', 'Ticket'),
('VIEW_TICKET',   'Ticket'),
('ASSIGN_TICKET', 'Ticket'),
('CLOSE_TICKET',  'Ticket')
ON CONFLICT (permission_name) DO NOTHING;

-- Sample admin (placeholder hash; run create_admin to set proper hash)
INSERT INTO app_user (username, email, password_hash, first_name, last_name)
VALUES ('admin', 'admin@itsm.com', '$2b$10$REPLACE_WITH_BCRYPT_HASH', 'System', 'Admin')
ON CONFLICT (email) DO NOTHING;

-- Assign admin role
INSERT INTO user_roles (user_id, role_id)
SELECT u.user_id, r.role_id
FROM app_user u, roles r
WHERE u.username = 'admin'
  AND r.role_name = 'ADMIN'
ON CONFLICT (user_id, role_id) DO NOTHING;
