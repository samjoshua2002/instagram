'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Sk } from '../components/Skeletons';
import { useApp } from '../context/AppContext';
import { useConfirm } from '../context/DialogContext';
import {
  Image as ImageIcon, Upload, Plus, Trash2, CheckCircle2,
  AlertCircle, RefreshCw, Link as LinkIcon, Film, Sparkles,
  Smile, Flame, Eye, Heart, HelpCircle, Frown, X, ExternalLink,
  Pencil, Tag, Search, Check
} from 'lucide-react';
import SuperadminWorkspacePrompt from '../components/SuperadminWorkspacePrompt';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { enterMotion } from '../lib/motion';
import PageHero from '../components/PageHero';
import { SegIndicator } from '../components/ui/motion';
import './vault.css';

function MediaVaultPageContent() {
  const { API_BASE, token, showToast, user, isImpersonating } = useApp();
  const confirm = useConfirm();

  const getAuthHeaders = (extraHeaders = {}) => {
    const currentToken = token || (typeof window !== 'undefined' ? localStorage.getItem('chatter_jwt_token') : null);
    return {
      ...extraHeaders,
      ...(currentToken ? { 'Authorization': `Bearer ${currentToken}` } : {})
    };
  };


  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Upload Form State
  const [uploadMode, setUploadMode] = useState('file'); // 'file' | 'url' | 'giphy'
  const [selectedCategory, setSelectedCategory] = useState('joy');
  const [mediaName, setMediaName] = useState('');
  const [mediaKeywords, setMediaKeywords] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState('');

  // Giphy Search Form State
  const [giphyQuery, setGiphyQuery] = useState('');
  const [giphyResults, setGiphyResults] = useState([]);
  const [searchingGiphy, setSearchingGiphy] = useState(false);
  const [selectedGiphyGifs, setSelectedGiphyGifs] = useState([]); // array of selected GIF objects
  const [batchCategory, setBatchCategory] = useState('joy');
  const [batchKeywords, setBatchKeywords] = useState('');
  const [addingBatch, setAddingBatch] = useState(false);

  // New Category State
  const [showNewCategoryModal, setShowNewCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);

  // Rename Category State
  const [renameModalCategory, setRenameModalCategory] = useState(null);
  const [renameTargetName, setRenameTargetName] = useState('');
  const [renamingCategory, setRenamingCategory] = useState(false);

  // Edit Media Item State
  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', category: 'joy', keywords: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  const fileInputRef = useRef(null);
  // Each vault load gets a number; only the newest one may update the screen
  const vaultRequestRef = useRef(0);

  useEffect(() => {
    fetchVaultData();
    // Switching category (or leaving) makes any answer still on its way stale
    return () => { vaultRequestRef.current += 1; };
  }, [activeCategory]);

  const fetchVaultData = async () => {
    const requestId = ++vaultRequestRef.current;
    const isStale = () => requestId !== vaultRequestRef.current;
    try {
      const url = activeCategory && activeCategory !== 'all'
        ? `${API_BASE}/api/media-vault?category=${activeCategory}`
        : `${API_BASE}/api/media-vault`;
      const res = await fetch(url, { headers: getAuthHeaders() });
      const data = await res.json();
      if (isStale()) return;
      if (data.success) {
        setItems(data.items || []);
        if (data.categories) {
          setCategories(data.categories);
        }
      } else {
        showToast(data.error || 'Failed to load media vault', 'error');
      }
    } catch (err) {
      if (isStale()) return;
      console.error('Failed to load media vault:', err);
      showToast('Failed to load media vault', 'error');
    } finally {
      if (!isStale()) setLoading(false);
    }
  };

  const handleSearchGiphy = async (e, customQuery = null) => {
    if (e) e.preventDefault();
    const query = (customQuery !== null ? customQuery : giphyQuery).trim();
    if (!query) return;
    if (customQuery !== null) setGiphyQuery(customQuery);
    setSearchingGiphy(true);
    setSelectedGiphyGifs([]);
    try {
      const res = await fetch(`${API_BASE}/api/giphy/search?q=${encodeURIComponent(query)}&limit=24`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success) {
        setGiphyResults(data.data || []);
        if (!batchKeywords || batchKeywords === giphyQuery.toLowerCase()) {
          setBatchKeywords(query.toLowerCase());
        }
      } else {
        showToast(data.error || 'Failed to search GIPHY', 'error');
      }
    } catch (err) {
      showToast('GIPHY search failed', 'error');
    } finally {
      setSearchingGiphy(false);
    }
  };

  const handleToggleSelectGiphy = (gif) => {
    setSelectedGiphyGifs(prev => {
      const exists = prev.some(g => g.id === gif.id);
      if (exists) {
        return prev.filter(g => g.id !== gif.id);
      } else {
        return [...prev, gif];
      }
    });
  };

  const handleSelectAllGiphy = () => {
    if (selectedGiphyGifs.length === giphyResults.length) {
      setSelectedGiphyGifs([]);
    } else {
      setSelectedGiphyGifs([...giphyResults]);
    }
  };

  const handleAddBatchToVault = async () => {
    if (selectedGiphyGifs.length === 0) {
      showToast('Please select at least one GIF to add', 'error');
      return;
    }
    setAddingBatch(true);
    try {
      const targetCat = batchCategory || selectedCategory || 'joy';
      const payloadItems = selectedGiphyGifs.map(g => {
        const url = g.images?.original?.url || g.images?.downsized?.url || g.images?.fixed_height?.url;
        const name = g.title ? g.title.replace(/GIF/gi, '').trim() : (giphyQuery || 'Reaction GIF');
        const kw = batchKeywords
          ? batchKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
          : (giphyQuery ? [giphyQuery.toLowerCase().trim()] : []);
        return {
          url,
          name,
          category: targetCat,
          keywords: kw,
          mediaType: 'gif'
        };
      });

      const res = await fetch(`${API_BASE}/api/media-vault/batch`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ items: payloadItems }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Added ${data.count} GIF(s) to [${targetCat}] vault!`, 'success');
        setSelectedGiphyGifs([]);
        fetchVaultData();
      } else {
        showToast(data.error || 'Failed to add GIFs', 'error');
      }
    } catch (err) {
      showToast('Network error adding GIFs', 'error');
    } finally {
      setAddingBatch(false);
    }
  };

  const handleSelectGiphyGif = (gif) => {
    const originalUrl = gif.images?.original?.url || gif.images?.downsized?.url || gif.images?.fixed_height?.url;
    setMediaUrl(originalUrl);
    setFilePreview(originalUrl);
    setMediaName(gif.title ? gif.title.replace(/GIF/gi, '').trim() : giphyQuery);
    if (!mediaKeywords) {
      setMediaKeywords(giphyQuery.toLowerCase().trim());
    }
    showToast('GIF selected! Select category and click Save.', 'success');
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!mediaName) {
        setMediaName(file.name.replace(/\.[^/.]+$/, ''));
      }
      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        setFilePreview(loadEvent.target?.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    setUploading(true);

    try {
      if (uploadMode === 'file') {
        if (!selectedFile) {
          showToast('Please select an image or GIF file to upload', 'error');
          setUploading(false);
          return;
        }

        const formData = new FormData();
        formData.append('media', selectedFile);
        formData.append('category', selectedCategory);
        formData.append('name', mediaName || selectedFile.name);
        formData.append('keywords', mediaKeywords);

        const res = await fetch(`${API_BASE}/api/media-vault/upload`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: formData,
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Uploaded to [${selectedCategory}]!`, 'success');
          setSelectedFile(null);
          setFilePreview('');
          setMediaName('');
          setMediaKeywords('');
          if (fileInputRef.current) fileInputRef.current.value = '';
          fetchVaultData();
        } else {
          showToast(data.error || 'Upload failed', 'error');
        }
      } else {
        // URL Mode
        if (!mediaUrl.trim()) {
          showToast('Please enter a valid image or GIF URL', 'error');
          setUploading(false);
          return;
        }

        const res = await fetch(`${API_BASE}/api/media-vault`, {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            url: mediaUrl.trim(),
            category: selectedCategory,
            name: mediaName.trim() || 'Reaction GIF',
            keywords: mediaKeywords,
            mediaType: mediaUrl.toLowerCase().includes('.gif') ? 'gif' : 'image',
          }),
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Added to [${selectedCategory}]!`, 'success');
          setMediaUrl('');
          setMediaName('');
          setMediaKeywords('');
          fetchVaultData();
        } else {
          showToast(data.error || 'Failed to add media URL', 'error');
        }
      }
    } catch (err) {
      console.error('Upload error:', err);
      showToast('Network error during upload', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteMedia = async (id, name) => {
    if (!(await confirm({ title: 'Delete from vault?', message: `"${name || 'This media'}" will be removed from your vault.`, confirmLabel: 'Delete', tone: 'danger' }))) return;

    try {
      const res = await fetch(`${API_BASE}/api/media-vault/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Media removed from vault', 'success');
        setItems(prev => prev.filter(item => item._id !== id));
      } else {
        showToast(data.error || 'Failed to delete', 'error');
      }
    } catch (err) {
      showToast('Delete error', 'error');
    }
  };

  // Open Edit Media Item Modal
  const openEditModal = (item) => {
    setEditingItem(item);
    setEditForm({
      name: item.name || '',
      category: item.category || 'joy',
      keywords: (item.keywords || []).join(', ')
    });
  };

  const handleSaveEditItem = async (e) => {
    e.preventDefault();
    if (!editingItem) return;

    setSavingEdit(true);
    try {
      const res = await fetch(`${API_BASE}/api/media-vault/${editingItem._id}`, {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Media updated!', 'success');
        setEditingItem(null);
        fetchVaultData();
      } else {
        showToast(data.error || 'Update failed', 'error');
      }
    } catch (err) {
      showToast('Save error', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  // Create Category
  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    setCreatingCategory(true);
    try {
      const res = await fetch(`${API_BASE}/api/media-vault/categories`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ category: newCategoryName.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Category "${newCategoryName}" created!`, 'success');
        setCategories(data.categories || []);
        setSelectedCategory(newCategoryName.toLowerCase().trim().replace(/[^a-z0-9_]/g, ''));
        setNewCategoryName('');
        setShowNewCategoryModal(false);
      } else {
        showToast(data.error || 'Failed to create category', 'error');
      }
    } catch (err) {
      showToast('Network error', 'error');
    } finally {
      setCreatingCategory(false);
    }
  };

  // Open Rename Category Modal
  const openRenameModal = (cat, e) => {
    e.stopPropagation();
    setRenameModalCategory(cat);
    setRenameTargetName(cat.id);
  };

  const handleRenameCategorySubmit = async (e) => {
    e.preventDefault();
    if (!renameModalCategory || !renameTargetName.trim()) return;

    setRenamingCategory(true);
    try {
      const res = await fetch(`${API_BASE}/api/media-vault/categories/${renameModalCategory.id}`, {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ newCategory: renameTargetName.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Category renamed to "${renameTargetName}"!`, 'success');
        // Items moved to the new name (same cleaning as the server): follow them if the old one was selected
        const oldId = renameModalCategory.id;
        const newId = renameTargetName.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
        setRenameModalCategory(null);
        if (Array.isArray(data.categories)) setCategories(data.categories);
        if (selectedCategory === oldId) setSelectedCategory(newId);
        if (activeCategory === oldId) setActiveCategory(newId); // refetches via the effect
        else fetchVaultData();
      } else {
        showToast(data.error || 'Rename failed', 'error');
      }
    } catch (err) {
      showToast('Rename network error', 'error');
    } finally {
      setRenamingCategory(false);
    }
  };

  const handleDeleteCustomCategory = async (catName, e) => {
    e.stopPropagation();
    if (!(await confirm({ title: `Delete "${catName}"?`, message: 'The category is removed. Media items stay in the vault.', confirmLabel: 'Delete category', tone: 'danger' }))) return;

    try {
      const res = await fetch(`${API_BASE}/api/media-vault/categories/${catName}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Category "${catName}" removed`, 'success');
        setCategories(prev => prev.filter(c => c.id !== catName));
        if (activeCategory === catName) setActiveCategory('all');
        if (selectedCategory === catName) setSelectedCategory('joy');
      } else {
        showToast(data.error || 'Failed to delete category', 'error');
      }
    } catch (err) {
      showToast('Failed to delete category', 'error');
    }
  };

  const getCategoryIcon = (id) => {
    switch (id) {
      case 'joy': return <Smile size={14} />;
      case 'lol': return <Sparkles size={14} />;
      case 'wonder': return <Eye size={14} />;
      case 'sad': return <Frown size={14} />;
      case 'happy': return <Heart size={14} />;
      case 'side_eye': return <Eye size={14} />;
      case 'confused': return <HelpCircle size={14} />;
      case 'cool': return <Flame size={14} />;
      default: return <Film size={14} />;
    }
  };

  const POPULAR_TAGS = [
    { label: 'Side eye', q: 'side eye sus' },
    { label: 'LOL', q: 'laughing dying' },
    { label: 'Mind blown', q: 'mind blown' },
    { label: 'Confused', q: 'travolta confused' },
    { label: 'Crying', q: 'crying meme' },
    { label: 'Hype dance', q: 'happy dance celebrate' },
    { label: 'Popcat', q: 'popcat' },
    { label: 'The Rock', q: 'the rock eyebrow' },
  ];
  const MODES = [
    { id: 'file', label: 'Upload file', icon: Upload },
    { id: 'giphy', label: 'Search GIPHY', icon: Search },
    { id: 'url', label: 'Paste URL', icon: LinkIcon },
  ];
  const categoryLabel = (id) => categories.find(c => c.id === id)?.label || id;
  const addPanelRef = useRef(null);

  const openMode = (mode) => {
    setUploadMode(mode);
    addPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (mode === 'file') fileInputRef.current?.click();
  };

  const renderCard = ({ key, url, name, category, badge, keywords, date, footer }) => (
    <div key={key} className="vx-card">
      <a className="vx-card-art" href={url} target="_blank" rel="noreferrer" title="Open full size">
        <img src={url} alt={name} loading="lazy" />
        <span className="vx-badge vx-badge-cat">{getCategoryIcon(category)}{categoryLabel(category)}</span>
        <span className="vx-badge vx-badge-type">{badge}</span>
      </a>
      <div className="vx-card-body">
        <div className="vx-card-title" title={name}>{name}</div>
        {date && <div className="vx-card-date">Added {new Date(date).toLocaleDateString()}</div>}
        {keywords?.length > 0 && (
          <div className="vx-tags">
            {keywords.slice(0, 5).map(kw => <span key={kw} className="spx-chip">#{kw}</span>)}
            {keywords.length > 5 && <span className="spx-chip" title={keywords.slice(5).join(', ')}>+{keywords.length - 5}</span>}
          </div>
        )}
      </div>
      <div className="vx-card-foot">{footer}</div>
    </div>
  );

  const renderModal = (open, onClose, title, children) => open && typeof document !== 'undefined' && createPortal(
    <div className="vx-modal-back" onClick={onClose} onKeyDown={e => e.key === 'Escape' && onClose()}>
      <div className="vx-modal spx-page" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="vx-modal-head">
          <h3>{title}</h3>
          <button type="button" className="spx-icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );

  return (
    <motion.div {...enterMotion} className="page-container settings-fullwidth spx-page vx-page">
      <PageHero
        seed="page-vault"
        icon={<Film size={96} strokeWidth={2} />}
        eyebrow="Reaction vault"
        title="Media & Reaction Vault"
        desc="Add GIFs and images with an emotion and a few keywords. When a chat matches, the AI sends your best matching reaction."
        meta={`${items.length} item${items.length === 1 ? '' : 's'} · ${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}`}
      >
        <button type="button" className="spx-play" onClick={() => openMode('file')}>
          <Upload size={18} /> Upload media
        </button>
        <button type="button" className="spx-outline" onClick={() => setShowNewCategoryModal(true)}>
          <Plus size={14} /> Add category
        </button>
        <button type="button" className="spx-icon-btn vx-refresh" onClick={fetchVaultData} title="Refresh vault" aria-label="Refresh vault">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </PageHero>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/gif,image/jpeg,image/png,image/webp"
        hidden
      />

      <div className="vx-layout">
      {/* Add media */}
      <div className="spx-panel vx-add" ref={addPanelRef}>
        <h2 className="vx-add-title">Add a reaction</h2>
        <div className="spx-pills vx-scroll vx-modes" role="tablist">
          {MODES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={uploadMode === id}
              className={`spx-pill${uploadMode === id ? ' active' : ''}`}
              onClick={() => setUploadMode(id)}
            >
              {uploadMode === id && <SegIndicator id="seg-vault" />}
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {uploadMode === 'giphy' ? (
          <div className="vx-giphy">
            <form className="vx-search" onSubmit={handleSearchGiphy}>
              <Search size={16} />
              <input
                type="search"
                placeholder="Search GIPHY, e.g. side eye, laugh, cat, dance"
                value={giphyQuery}
                onChange={e => setGiphyQuery(e.target.value)}
                aria-label="Search GIPHY"
              />
              <button type="submit" className="spx-play vx-play-sm" disabled={searchingGiphy || !giphyQuery.trim()}>
                {searchingGiphy ? <RefreshCw size={14} className="animate-spin" /> : 'Search'}
              </button>
            </form>

            <div className="vx-popular vx-scroll">
              <span className="vx-label">Popular</span>
              {POPULAR_TAGS.map(tag => (
                <button key={tag.label} type="button" className="spx-pill vx-pill-sm" onClick={() => handleSearchGiphy(null, tag.q)}>
                  #{tag.label}
                </button>
              ))}
            </div>

            {giphyResults.length > 0 && (
              <div className="vx-batch">
                <div className="vx-batch-count">
                  <span className={`spx-chip${selectedGiphyGifs.length ? ' spx-chip-green' : ''}`}>{selectedGiphyGifs.length} selected</span>
                  <button type="button" className="spx-outline" onClick={handleSelectAllGiphy}>
                    <Check size={13} /> {selectedGiphyGifs.length === giphyResults.length ? 'Clear all' : 'Select all'}
                  </button>
                </div>
                <div className="vx-batch-form">
                  <select value={batchCategory} onChange={e => setBatchCategory(e.target.value)} aria-label="Category for selected GIFs">
                    {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.label || cat.id}</option>)}
                  </select>
                  <input
                    type="text"
                    placeholder="Keywords, e.g. sus, doubt"
                    value={batchKeywords}
                    onChange={e => setBatchKeywords(e.target.value)}
                    aria-label="Keywords for selected GIFs"
                  />
                  <button
                    type="button"
                    className="spx-play vx-play-sm"
                    onClick={handleAddBatchToVault}
                    disabled={addingBatch || selectedGiphyGifs.length === 0}
                  >
                    {addingBatch
                      ? <><RefreshCw size={14} className="animate-spin" /> Adding…</>
                      : <><Plus size={14} /> Add {selectedGiphyGifs.length || ''} to {categoryLabel(batchCategory)}</>}
                  </button>
                </div>
              </div>
            )}

            {searchingGiphy ? (
              <div className="vx-pick-grid" role="status" aria-busy="true" aria-label="Searching GIPHY">
                {Array.from({ length: 8 }, (_, i) => <Sk key={i} h={0} r={8} style={{ paddingBottom: '100%' }} />)}
              </div>
            ) : giphyResults.length === 0 ? (
              <div className="vx-hint">
                <Film className="icon-keep" size={28} />
                <div>Search, or tap a popular tag, then pick the GIFs you want.</div>
              </div>
            ) : (
              <div className="vx-pick-grid">
                {giphyResults.map(gif => {
                  const previewUrl = gif.images?.fixed_height_small?.url || gif.images?.downsized?.url || gif.images?.original?.url;
                  const isSelected = selectedGiphyGifs.some(g => g.id === gif.id);
                  const alreadyInVault = items.some(i => i.url === (gif.images?.original?.url || gif.images?.downsized?.url));
                  return (
                    <button
                      key={gif.id}
                      type="button"
                      className={`vx-pick${isSelected ? ' selected' : ''}`}
                      onClick={() => handleToggleSelectGiphy(gif)}
                      aria-pressed={isSelected}
                      title={gif.title || 'Reaction GIF'}
                    >
                      <img src={previewUrl} alt={gif.title || 'GIF'} loading="lazy" />
                      <span className="vx-pick-check">{isSelected && <Check size={14} />}</span>
                      {alreadyInVault && <span className="vx-badge vx-badge-in">In vault</span>}
                      <span className="vx-pick-title">{gif.title || 'Reaction GIF'}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <form className="vx-form" onSubmit={handleUploadSubmit}>
            <div className="vx-form-grid">
              <label className="vx-field">
                <span className="vx-label">Emotion</span>
                <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.label || cat.id}{cat.isCustom ? ' (custom)' : ''}</option>
                  ))}
                </select>
              </label>
              <label className="vx-field">
                <span className="vx-label">Title</span>
                <input
                  type="text"
                  placeholder="e.g. Side eye dog, Popcat"
                  value={mediaName}
                  onChange={e => setMediaName(e.target.value)}
                />
              </label>
            </div>

            <label className="vx-field">
              <span className="vx-label"><Tag size={12} /> Keywords (comma separated)</span>
              <input
                type="text"
                placeholder="e.g. sus, judging, doubt, bombastic"
                value={mediaKeywords}
                onChange={e => setMediaKeywords(e.target.value)}
              />
              <span className="vx-help">When a friend texts one of these words, the AI picks this reaction first.</span>
            </label>

            {uploadMode === 'file' ? (
              <div
                className={`spx-drop vx-drop${filePreview ? ' has-file' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInputRef.current?.click()}
              >
                {filePreview ? (
                  <>
                    <img className="vx-drop-preview" src={filePreview} alt="Selected file preview" />
                    <div className="spx-drop-sub">
                      <strong>{selectedFile?.name}</strong> · {((selectedFile?.size || 0) / 1024).toFixed(0)} KB · tap to change
                    </div>
                  </>
                ) : (
                  <>
                    <div className="spx-drop-icon"><Upload size={26} className="icon-keep" /></div>
                    <div className="spx-drop-title">Choose an image or GIF</div>
                    <div className="spx-drop-sub">GIF, JPG, PNG or WebP, up to 15 MB</div>
                  </>
                )}
              </div>
            ) : (
              <label className="vx-field">
                <span className="vx-label">Image or GIF link</span>
                <input
                  type="url"
                  placeholder="https://media.giphy.com/media/…/giphy.gif"
                  value={mediaUrl}
                  onChange={e => setMediaUrl(e.target.value)}
                />
                <span className="vx-help">Works with GIPHY, Tenor, Imgur or any direct image link.</span>
              </label>
            )}

            <button type="submit" className="spx-play" disabled={uploading}>
              {uploading
                ? <><RefreshCw size={16} className="animate-spin" /> Saving…</>
                : <><CheckCircle2 size={16} /> Save to {categoryLabel(selectedCategory)}</>}
            </button>
          </form>
        )}
      </div>

      {/* Gallery */}
      <section className="vx-gallery">
      <div className="spx-section-head vx-gallery-head">
        <h2 className="spx-section-title">Your reactions <span className="vx-count">{items.length}</span></h2>
      </div>

      <div className="spx-pills vx-scroll vx-cats" aria-label="Filter by emotion">
        <button type="button" className={`spx-pill${activeCategory === 'all' ? ' active' : ''}`} onClick={() => setActiveCategory('all')}>
          All
        </button>
        {categories.map(cat => {
          const isSelected = activeCategory === cat.id;
          return (
            <div
              key={cat.id}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              className={`spx-pill${isSelected ? ' active' : ''}`}
              onClick={() => setActiveCategory(cat.id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setActiveCategory(cat.id)}
            >
              {getCategoryIcon(cat.id)}
              <span>{cat.label || cat.id}</span>
              {cat.isCustom && (
                <>
                  <button type="button" className="vx-pill-act" onClick={(e) => openRenameModal(cat, e)} title="Rename category" aria-label={`Rename ${cat.id}`}>
                    <Pencil size={12} />
                  </button>
                  <button type="button" className="vx-pill-act" onClick={(e) => handleDeleteCustomCategory(cat.id, e)} title="Delete category" aria-label={`Delete ${cat.id}`}>
                    <X size={13} />
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {loading ? (
        <div className="vx-grid" role="status" aria-busy="true" aria-label="Loading reaction vault media">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="vx-card vx-card-sk">
              <Sk h={0} r={0} style={{ paddingBottom: '75%' }} />
              <div className="vx-card-body"><Sk w="65%" h={13} /><Sk w="40%" h={11} /></div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="spx-empty-card vx-empty">
          <ImageIcon className="icon-keep" size={32} />
          <div className="vx-empty-title">No reactions in {activeCategory === 'all' ? 'your vault' : categoryLabel(activeCategory)} yet</div>
          <p>Upload a GIF, search GIPHY or paste a link above and save it here.</p>
          <button
            type="button"
            className="spx-play vx-play-sm"
            onClick={() => {
              if (activeCategory !== 'all') setSelectedCategory(activeCategory);
              openMode('file');
            }}
          >
            <Upload size={14} /> Upload media
          </button>
        </div>
      ) : (
        <div className="vx-grid stagger-in">
          {items.map(item => renderCard({
            key: item._id,
            url: item.url,
            name: item.name,
            category: item.category,
            badge: item.mediaType?.toUpperCase() || 'GIF',
            keywords: item.keywords,
            date: item.createdAt,
            footer: (
              <>
                <a className="spx-icon-btn" href={item.url} target="_blank" rel="noreferrer" title="Open full size" aria-label="Open full size"><ExternalLink size={15} /></a>
                <span className="vx-foot-gap" />
                <button type="button" className="spx-icon-btn" onClick={() => openEditModal(item)} title="Edit title and keywords" aria-label="Edit"><Pencil size={15} /></button>
                <button type="button" className="spx-icon-btn vx-danger" onClick={() => handleDeleteMedia(item._id, item.name)} title="Delete" aria-label="Delete"><Trash2 size={15} /></button>
              </>
            ),
          }))}
        </div>
      )}

      </section>
      </div>

      {renderModal(!!editingItem, () => setEditingItem(null), 'Edit reaction', (
        <form className="vx-form" onSubmit={handleSaveEditItem}>
          <label className="vx-field">
            <span className="vx-label">Title</span>
            <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
          </label>
          <label className="vx-field">
            <span className="vx-label">Emotion</span>
            <select value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value })}>
              {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.label || cat.id}</option>)}
            </select>
          </label>
          <label className="vx-field">
            <span className="vx-label">Keywords (comma separated)</span>
            <input type="text" value={editForm.keywords} onChange={e => setEditForm({ ...editForm, keywords: e.target.value })} placeholder="e.g. sus, judging, doubt" />
          </label>
          <div className="vx-modal-actions">
            <button type="button" className="spx-outline" onClick={() => setEditingItem(null)}>Cancel</button>
            <button type="submit" className="spx-play vx-play-sm" disabled={savingEdit}>{savingEdit ? 'Saving…' : 'Save changes'}</button>
          </div>
        </form>
      ))}

      {renderModal(showNewCategoryModal, () => setShowNewCategoryModal(false), 'New category', (
        <form className="vx-form" onSubmit={handleCreateCategory}>
          <p className="vx-help">A custom emotion such as savage, flirty, gaming or food. The AI uses your media when this mood comes up.</p>
          <label className="vx-field">
            <span className="vx-label">Name</span>
            <input type="text" placeholder="e.g. savage" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} autoFocus />
          </label>
          <div className="vx-modal-actions">
            <button type="button" className="spx-outline" onClick={() => setShowNewCategoryModal(false)}>Cancel</button>
            <button type="submit" className="spx-play vx-play-sm" disabled={creatingCategory || !newCategoryName.trim()}>{creatingCategory ? 'Creating…' : 'Create category'}</button>
          </div>
        </form>
      ))}

      {renderModal(!!renameModalCategory, () => setRenameModalCategory(null), `Rename "${renameModalCategory?.id || ''}"`, (
        <form className="vx-form" onSubmit={handleRenameCategorySubmit}>
          <p className="vx-help">Every reaction in this category moves to the new name.</p>
          <label className="vx-field">
            <span className="vx-label">New name</span>
            <input type="text" value={renameTargetName} onChange={e => setRenameTargetName(e.target.value)} autoFocus />
          </label>
          <div className="vx-modal-actions">
            <button type="button" className="spx-outline" onClick={() => setRenameModalCategory(null)}>Cancel</button>
            <button type="submit" className="spx-play vx-play-sm" disabled={renamingCategory || !renameTargetName.trim()}>{renamingCategory ? 'Saving…' : 'Rename'}</button>
          </div>
        </form>
      ))}
    </motion.div>
  );
}

// The superadmin check lives outside the page so the page's hooks always run in the same order
export default function MediaVaultPage() {
  const { user, isImpersonating } = useApp();
  if (user?.role === 'superadmin' && !isImpersonating) {
    return (
      <SuperadminWorkspacePrompt
        sectionTitle="Creator Media Vault"
        sectionCode="05 // VAULT"
        sectionDescription="Reaction images, GIFs, and media vault assets are stored per individual creator workspace. Choose a creator workspace below to inspect and manage their media vault."
      />
    );
  }
  return <MediaVaultPageContent />;
}
