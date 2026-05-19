import json


def test_resolve_prefers_env_vars(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://env.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "env-key")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "env-anon")

    from registry_config import resolve

    cfg = resolve()
    assert cfg is not None
    assert cfg.url == "https://env.supabase.co"
    assert cfg.service_role_key == "env-key"
    assert cfg.source == "env"


def test_resolve_falls_back_to_registry(monkeypatch, tmp_path):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    import registry_config

    monkeypatch.setattr(registry_config, "REGISTRY_PATH", tmp_path / "workspaces.json")
    monkeypatch.setattr(registry_config, "SECRETS_PATH", tmp_path / "secrets.json")

    workspaces_data = {
        "activeWorkspaceId": "ws-1",
        "workspaces": [
            {
                "id": "ws-1",
                "url": "https://registry.supabase.co",
                "anonKey": "anon-key-1",
            }
        ],
    }
    secrets_data = {
        "workspaces": {
            "ws-1": {"serviceRoleKey": "srk-1"},
        }
    }
    (tmp_path / "workspaces.json").write_text(json.dumps(workspaces_data))
    (tmp_path / "secrets.json").write_text(json.dumps(secrets_data))

    cfg = registry_config.resolve()
    assert cfg is not None
    assert cfg.url == "https://registry.supabase.co"
    assert cfg.service_role_key == "srk-1"
    assert cfg.source == "registry"
    assert cfg.project_id == "ws-1"


def test_resolve_returns_none_when_nothing_available(monkeypatch, tmp_path):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    import registry_config

    monkeypatch.setattr(registry_config, "REGISTRY_PATH", tmp_path / "workspaces.json")
    monkeypatch.setattr(registry_config, "SECRETS_PATH", tmp_path / "secrets.json")

    cfg = registry_config.resolve()
    assert cfg is None


def test_read_from_registry_picks_active_workspace(monkeypatch, tmp_path):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    import registry_config

    monkeypatch.setattr(registry_config, "REGISTRY_PATH", tmp_path / "workspaces.json")
    monkeypatch.setattr(registry_config, "SECRETS_PATH", tmp_path / "secrets.json")

    workspaces_data = {
        "activeWorkspaceId": "ws-2",
        "workspaces": [
            {"id": "ws-1", "url": "https://one.supabase.co", "anonKey": "ak1"},
            {"id": "ws-2", "url": "https://two.supabase.co", "anonKey": "ak2"},
        ],
    }
    secrets_data = {
        "workspaces": {
            "ws-1": {"serviceRoleKey": "srk-1"},
            "ws-2": {"serviceRoleKey": "srk-2"},
        }
    }
    (tmp_path / "workspaces.json").write_text(json.dumps(workspaces_data))
    (tmp_path / "secrets.json").write_text(json.dumps(secrets_data))

    cfg = registry_config.read_from_registry()
    assert cfg is not None
    assert cfg.url == "https://two.supabase.co"
    assert cfg.service_role_key == "srk-2"
    assert cfg.project_id == "ws-2"


def test_read_from_registry_falls_back_to_first_workspace(monkeypatch, tmp_path):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    import registry_config

    monkeypatch.setattr(registry_config, "REGISTRY_PATH", tmp_path / "workspaces.json")
    monkeypatch.setattr(registry_config, "SECRETS_PATH", tmp_path / "secrets.json")

    workspaces_data = {
        "workspaces": [
            {"id": "ws-1", "url": "https://first.supabase.co", "anonKey": "ak1"},
        ],
    }
    secrets_data = {"workspaces": {"ws-1": {"serviceRoleKey": "srk-1"}}}
    (tmp_path / "workspaces.json").write_text(json.dumps(workspaces_data))
    (tmp_path / "secrets.json").write_text(json.dumps(secrets_data))

    cfg = registry_config.read_from_registry()
    assert cfg is not None
    assert cfg.url == "https://first.supabase.co"


def test_read_from_registry_returns_none_when_missing_service_key(monkeypatch, tmp_path):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    import registry_config

    monkeypatch.setattr(registry_config, "REGISTRY_PATH", tmp_path / "workspaces.json")
    monkeypatch.setattr(registry_config, "SECRETS_PATH", tmp_path / "secrets.json")

    workspaces_data = {
        "workspaces": [
            {"id": "ws-1", "url": "https://test.supabase.co", "anonKey": "ak1"},
        ],
    }
    (tmp_path / "workspaces.json").write_text(json.dumps(workspaces_data))
    (tmp_path / "secrets.json").write_text(json.dumps({"workspaces": {}}))

    cfg = registry_config.read_from_registry()
    assert cfg is None


def test_read_from_registry_backward_compat_projects_key(monkeypatch, tmp_path):
    """Old installs may still have 'projects' / 'activeProjectId' keys."""
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    import registry_config

    monkeypatch.setattr(registry_config, "REGISTRY_PATH", tmp_path / "workspaces.json")
    monkeypatch.setattr(registry_config, "SECRETS_PATH", tmp_path / "secrets.json")

    legacy_data = {
        "activeProjectId": "proj-1",
        "projects": [
            {"id": "proj-1", "url": "https://legacy.supabase.co", "anonKey": "ak-legacy"},
        ],
    }
    secrets_data = {"projects": {"proj-1": {"serviceRoleKey": "srk-legacy"}}}
    (tmp_path / "workspaces.json").write_text(json.dumps(legacy_data))
    (tmp_path / "secrets.json").write_text(json.dumps(secrets_data))

    cfg = registry_config.read_from_registry()
    assert cfg is not None
    assert cfg.url == "https://legacy.supabase.co"
    assert cfg.service_role_key == "srk-legacy"
