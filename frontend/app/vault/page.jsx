'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import {
  Image as ImageIcon, Upload, Plus, Trash2, CheckCircle2,
  AlertCircle, RefreshCw, Link as LinkIcon, Film, Sparkles,
  Smile, Flame, Eye, Heart, HelpCircle, Frown, X, ExternalLink,
  Pencil, Tag, Search, Download, Key, Check, Layers
} from 'lucide-react';

export default function MediaVaultPage() {
  const { API_BASE, showToast } = useApp();

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Gallery View Switcher: 'vault' | 'predefined'
  const [galleryView, setGalleryView] = useState('vault');
  const [predefinedList, setPredefinedList] = useState([]);
  const [importingPredefined, setImportingPredefined] = useState(false);

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

  useEffect(() => {
    fetchVaultData();
    fetchPredefined();
  }, [activeCategory]);

  const fetchVaultData = async () => {
    try {
      const url = activeCategory && activeCategory !== 'all'
        ? `${API_BASE}/api/media-vault?category=${activeCategory}`
        : `${API_BASE}/api/media-vault`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setItems(data.items || []);
        if (data.categories) {
          setCategories(data.categories);
        }
      }
    } catch (err) {
      console.error('Failed to load media vault:', err);
      showToast('Failed to load media vault', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchPredefined = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/media-vault/predefined`);
      const data = await res.json();
      if (data.success) {
        setPredefinedList(data.predefined || []);
      }
    } catch (_) {}
  };

  const handleImportPredefined = async (ids = null) => {
    setImportingPredefined(true);
    try {
      const res = await fetch(`${API_BASE}/api/media-vault/import-predefined`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (data.success) {
        const added = data.results?.added || 0;
        const skipped = data.results?.skipped || 0;
        showToast(`Imported ${added} reaction GIFs! (${skipped} already in vault)`, 'success');
        fetchVaultData();
      } else {
        showToast(data.error || 'Failed to import predefined GIFs', 'error');
      }
    } catch (err) {
      showToast('Import error', 'error');
    } finally {
      setImportingPredefined(false);
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
      const res = await fetch(`${API_BASE}/api/giphy/search?q=${encodeURIComponent(query)}&limit=24`);
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
        headers: { 'Content-Type': 'application/json' },
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
          headers: { 'Content-Type': 'application/json' },
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
    if (!window.confirm(`Delete "${name || 'this media'}" from vault?`)) return;

    try {
      const res = await fetch(`${API_BASE}/api/media-vault/${id}`, {
        method: 'DELETE',
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newCategory: renameTargetName.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Category renamed to "${renameTargetName}"!`, 'success');
        setRenameModalCategory(null);
        fetchVaultData();
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
    if (!window.confirm(`Delete custom category "${catName}"? Media items will remain in the vault.`)) return;

    try {
      const res = await fetch(`${API_BASE}/api/media-vault/categories/${catName}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Category "${catName}" removed`, 'success');
        setCategories(prev => prev.filter(c => c.id !== catName));
        if (activeCategory === catName) setActiveCategory('all');
        if (selectedCategory === catName) setSelectedCategory('joy');
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

  return (
    <div className="page-container settings-fullwidth" style={{ maxWidth: '100%', width: '100%' }}>

      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: '700', padding: '3px 8px', borderRadius: '4px', background: '#09090b', color: '#ffffff', letterSpacing: '0.05em' }}>
              SECTION 05
            </span>
            <span style={{ fontSize: '0.76rem', color: '#71717a', fontWeight: '600' }}>
              REACTION VAULT & EMOTION ATTACHMENTS (50% PRIORITY)
            </span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#09090b', letterSpacing: '-0.03em', margin: 0 }}>
            Media & Reaction Vault
          </h1>
          <p style={{ fontSize: '0.86rem', color: '#71717a', marginTop: '4px', maxWidth: '720px' }}>
            Upload images and GIFs with labels & keywords across emotion categories (Joy, LOL, Wonder, Sad, Side Eye, etc.). The AI intelligently detects emotions and keywords in chat to pick your best matching GIF.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setShowNewCategoryModal(true)}
            className="btn"
            style={{ fontSize: '0.8rem', padding: '8px 14px' }}
          >
            <Plus size={14} />
            <span>+ Add Category</span>
          </button>
          <button
            onClick={fetchVaultData}
            className="btn"
            style={{ fontSize: '0.8rem', padding: '8px 14px' }}
            title="Refresh vault"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* TOP SECTION: UPLOAD / ADD FORM */}
      <div style={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '22px', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Upload size={18} style={{ color: '#09090b' }} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#09090b', margin: 0 }}>
              Add Media with Keywords & Emotions
            </h3>
          </div>

          {/* Mode Switcher */}
          <div style={{ display: 'flex', background: '#f4f4f5', borderRadius: '8px', padding: '3px' }}>
            <button
              type="button"
              onClick={() => setUploadMode('file')}
              style={{
                background: uploadMode === 'file' ? '#ffffff' : 'transparent',
                color: uploadMode === 'file' ? '#09090b' : '#71717a',
                border: 'none',
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: uploadMode === 'file' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
              }}
            >
              Upload Device File
            </button>
            <button
              type="button"
              onClick={() => setUploadMode('giphy')}
              style={{
                background: uploadMode === 'giphy' ? '#ffffff' : 'transparent',
                color: uploadMode === 'giphy' ? '#09090b' : '#71717a',
                border: 'none',
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: uploadMode === 'giphy' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
              }}
            >
              Search GIPHY API
            </button>
            <button
              type="button"
              onClick={() => setUploadMode('url')}
              style={{
                background: uploadMode === 'url' ? '#ffffff' : 'transparent',
                color: uploadMode === 'url' ? '#09090b' : '#71717a',
                border: 'none',
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: uploadMode === 'url' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
              }}
            >
              Paste Direct URL
            </button>
          </div>
        </div>

        {/* GIPHY MULTI-SELECT STUDIO */}
        {uploadMode === 'giphy' && (
          <div style={{ padding: '18px', background: '#fafafa', borderRadius: '10px', border: '1px solid #e4e4e7', marginBottom: '8px' }}>
            {/* Search Input Bar */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <input
                type="text"
                placeholder="Search GIPHY live (e.g. sus, side eye, laugh, travolta, cat, dance)..."
                value={giphyQuery}
                onChange={e => setGiphyQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSearchGiphy(e); }}
                style={{ flex: 1, height: '40px', fontSize: '0.86rem' }}
              />
              <button
                type="button"
                onClick={handleSearchGiphy}
                disabled={searchingGiphy || !giphyQuery.trim()}
                className="btn btn-primary"
                style={{ fontSize: '0.82rem', padding: '0 18px', height: '40px' }}
              >
                {searchingGiphy ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
                <span>Search</span>
              </button>
            </div>

            {/* Quick Keyword Suggestion Pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <span style={{ fontSize: '0.72rem', color: '#71717a', fontWeight: '700', textTransform: 'uppercase' }}>
                Popular:
              </span>
              {[
                { label: 'Side Eye / Sus', q: 'side eye sus' },
                { label: 'Laugh / LOL', q: 'laughing dying' },
                { label: 'Shock / Mind Blown', q: 'mind blown' },
                { label: 'Confused / Travolta', q: 'travolta confused' },
                { label: 'Crying / Tears', q: 'crying meme' },
                { label: 'Hype / Dance', q: 'happy dance celebrate' },
                { label: 'Popcat / Cats', q: 'popcat' },
                { label: 'The Rock', q: 'the rock eyebrow' },
              ].map(tag => (
                <button
                  key={tag.label}
                  type="button"
                  onClick={() => handleSearchGiphy(null, tag.q)}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e4e4e7',
                    borderRadius: '14px',
                    padding: '3px 10px',
                    fontSize: '0.72rem',
                    fontWeight: '600',
                    color: '#09090b',
                    cursor: 'pointer'
                  }}
                >
                  #{tag.label}
                </button>
              ))}
            </div>

            {/* BATCH ACTION TOOLBAR (when GIFs are loaded) */}
            {giphyResults.length > 0 && (
              <div style={{
                background: '#ffffff',
                border: '1px solid #e4e4e7',
                borderRadius: '8px',
                padding: '12px 14px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                {/* Selection Count & Select All */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{
                    fontSize: '0.76rem',
                    fontWeight: '800',
                    padding: '3px 9px',
                    borderRadius: '4px',
                    background: selectedGiphyGifs.length > 0 ? '#09090b' : '#f4f4f5',
                    color: selectedGiphyGifs.length > 0 ? '#ffffff' : '#71717a'
                  }}>
                    {selectedGiphyGifs.length} Selected
                  </span>

                  <button
                    type="button"
                    onClick={handleSelectAllGiphy}
                    className="btn"
                    style={{ fontSize: '0.74rem', padding: '4px 10px' }}
                  >
                    <Check size={12} />
                    <span>{selectedGiphyGifs.length === giphyResults.length ? 'Deselect All' : 'Select All'}</span>
                  </button>
                </div>

                {/* Target Category & Keywords & Add Button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#71717a' }}>Category:</span>
                    <select
                      value={batchCategory}
                      onChange={e => setBatchCategory(e.target.value)}
                      style={{ height: '32px', fontSize: '0.78rem', width: 'auto', padding: '4px 8px' }}
                    >
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>
                          {cat.label || cat.id}
                        </option>
                      ))}
                    </select>
                  </div>

                  <input
                    type="text"
                    placeholder="Keywords (e.g. sus, ai, doubt)"
                    value={batchKeywords}
                    onChange={e => setBatchKeywords(e.target.value)}
                    style={{ height: '32px', fontSize: '0.78rem', width: '180px', padding: '4px 8px' }}
                  />

                  <button
                    type="button"
                    onClick={handleAddBatchToVault}
                    disabled={addingBatch || selectedGiphyGifs.length === 0}
                    className="btn btn-primary"
                    style={{
                      fontSize: '0.78rem',
                      padding: '5px 14px',
                      opacity: selectedGiphyGifs.length === 0 ? 0.5 : 1,
                      cursor: selectedGiphyGifs.length === 0 ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {addingBatch ? (
                      <>
                        <RefreshCw size={12} className="animate-spin" />
                        <span>Adding {selectedGiphyGifs.length}...</span>
                      </>
                    ) : (
                      <>
                        <Plus size={13} />
                        <span>Add {selectedGiphyGifs.length > 0 ? selectedGiphyGifs.length : ''} to [{batchCategory}] Vault</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* RESULTS MULTI-SELECT GRID */}
            {searchingGiphy ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#71717a' }}>
                <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px auto' }} />
                <div style={{ fontSize: '0.84rem' }}>Searching GIPHY live...</div>
              </div>
            ) : giphyResults.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 0', color: '#a1a1aa' }}>
                <Film size={28} style={{ margin: '0 auto 8px auto' }} />
                <div style={{ fontSize: '0.84rem' }}>Type a search query or click a popular tag above to preview and pick GIFs!</div>
              </div>
            ) : (
              <div>
                <span style={{ fontSize: '0.72rem', color: '#71717a', fontWeight: '700', textTransform: 'uppercase', display: 'block', marginBottom: '10px' }}>
                  Click to select multiple GIFs for batch import:
                </span>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
                  gap: '10px',
                  maxHeight: '440px',
                  overflowY: 'auto',
                  padding: '4px'
                }}>
                  {giphyResults.map(gif => {
                    const previewUrl = gif.images?.fixed_height_small?.url || gif.images?.downsized?.url || gif.images?.original?.url;
                    const isSelected = selectedGiphyGifs.some(g => g.id === gif.id);
                    const alreadyInVault = items.some(i => i.url === (gif.images?.original?.url || gif.images?.downsized?.url));

                    return (
                      <div
                        key={gif.id}
                        onClick={() => handleToggleSelectGiphy(gif)}
                        style={{
                          height: '140px',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          cursor: 'pointer',
                          border: isSelected ? '3px solid #09090b' : '1px solid #e4e4e7',
                          position: 'relative',
                          background: '#ffffff',
                          boxShadow: isSelected ? '0 4px 12px rgba(0,0,0,0.12)' : 'none',
                          transition: 'transform 0.12s ease, border-color 0.12s ease'
                        }}
                      >
                        <img
                          src={previewUrl}
                          alt={gif.title || 'GIF'}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          loading="lazy"
                        />

                        {/* Top Selection Pill */}
                        <div style={{
                          position: 'absolute',
                          top: '6px',
                          right: '6px',
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: isSelected ? '#09090b' : 'rgba(255,255,255,0.85)',
                          color: isSelected ? '#ffffff' : '#09090b',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                          border: isSelected ? 'none' : '1px solid #d4d4d8'
                        }}>
                          {isSelected ? <Check size={14} /> : null}
                        </div>

                        {/* Status if already in vault */}
                        {alreadyInVault && (
                          <span style={{
                            position: 'absolute',
                            top: '6px',
                            left: '6px',
                            background: 'rgba(22, 163, 74, 0.9)',
                            color: '#ffffff',
                            fontSize: '0.6rem',
                            fontWeight: '700',
                            padding: '2px 6px',
                            borderRadius: '4px'
                          }}>
                            In Vault
                          </span>
                        )}

                        {/* Title Caption overlay */}
                        <div style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          right: 0,
                          background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
                          padding: '16px 8px 6px 8px',
                          color: '#ffffff',
                          fontSize: '0.68rem',
                          fontWeight: '600',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {gif.title || 'Reaction GIF'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* MANUAL UPLOAD FORM (Shown when in 'file' or 'url' mode) */}
        {uploadMode !== 'giphy' && (
        <form onSubmit={handleUploadSubmit}>
          <div className="responsive-form-grid" style={{ marginBottom: '16px' }}>
            {/* Category Select */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', color: '#71717a', marginBottom: '6px' }}>
                Emotion Category
              </label>
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                style={{ height: '40px', fontWeight: '600' }}
              >
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label || cat.id} {cat.isCustom ? '(Custom)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Media Name */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', color: '#71717a', marginBottom: '6px' }}>
                Media Title / Label (Used by AI to understand the humor)
              </label>
              <input
                type="text"
                placeholder="e.g. Bombastic side eye dog, Leonardo cheer, Popcat"
                value={mediaName}
                onChange={e => setMediaName(e.target.value)}
                style={{ height: '40px' }}
              />
            </div>
          </div>

          {/* Keywords / Tags Row */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', color: '#71717a', marginBottom: '6px' }}>
              <Tag size={13} />
              <span>Keywords & Humour Triggers (Comma separated)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. sus, judging, ai, robot, fake, bombastic, dog, doubt (Add multiple keywords so 1 GIF triggers across diverse chats!)"
              value={mediaKeywords}
              onChange={e => setMediaKeywords(e.target.value)}
              style={{ height: '40px' }}
            />
            <span style={{ fontSize: '0.72rem', color: '#71717a', marginTop: '4px', display: 'block' }}>
              When friends text any of these words (e.g. &quot;u sus&quot;, &quot;why chatting like ai&quot;), the AI prioritizes this exact reaction!
            </span>
          </div>

          {/* Upload Input Area */}
          {uploadMode === 'file' ? (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', color: '#71717a', marginBottom: '6px' }}>
                Select File (GIF, JPG, PNG, WebP)
              </label>
              <div
                style={{
                  border: '2px dashed #e4e4e7',
                  borderRadius: '10px',
                  padding: '24px',
                  textAlign: 'center',
                  background: '#fafafa',
                  cursor: 'pointer'
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/gif,image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                />
                {filePreview ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                    <img
                      src={filePreview}
                      alt="Preview"
                      style={{ maxHeight: '140px', maxWidth: '240px', borderRadius: '8px', objectFit: 'contain' }}
                    />
                    <span style={{ fontSize: '0.8rem', color: '#16a34a', fontWeight: '700' }}>
                      File selected: {selectedFile?.name} ({((selectedFile?.size || 0) / 1024).toFixed(0)} KB) — Click to change
                    </span>
                  </div>
                ) : (
                  <div>
                    <Upload size={28} style={{ color: '#a1a1aa', margin: '0 auto 8px auto' }} />
                    <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#09090b' }}>
                      Click to choose an image or GIF file
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#71717a', marginTop: '4px' }}>
                      Supports animated GIFs, JPG, PNG, and WebP up to 15MB
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : uploadMode === 'giphy' ? (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', color: '#71717a', marginBottom: '6px' }}>
                Selected GIPHY URL
              </label>
              <input
                type="url"
                placeholder="Select a GIF from search above or paste URL"
                value={mediaUrl}
                onChange={e => { setMediaUrl(e.target.value); setFilePreview(e.target.value); }}
                style={{ height: '40px' }}
              />
              {filePreview && (
                <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <img src={filePreview} alt="Selected" style={{ maxHeight: '90px', borderRadius: '6px' }} />
                  <span style={{ fontSize: '0.76rem', color: '#16a34a', fontWeight: '700' }}>Ready to save to vault</span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', color: '#71717a', marginBottom: '6px' }}>
                Direct GIF or Image URL (Tenor / Giphy / Imgur / CDN)
              </label>
              <input
                type="url"
                placeholder="https://media.giphy.com/media/.../giphy.gif"
                value={mediaUrl}
                onChange={e => setMediaUrl(e.target.value)}
                style={{ height: '40px' }}
              />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={uploading}
              className="btn btn-primary"
              style={{ padding: '9px 24px', fontSize: '0.84rem' }}
            >
              {uploading ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Uploading to Vault...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  <span>Save to [{selectedCategory}] Vault</span>
                </>
              )}
            </button>
          </div>
        </form>
        )}
      </div>

      {/* QUICK IMPORT BANNER FOR PREDEFINED GIFS */}
      <div style={{
        background: '#fcfcfc',
        border: '1px solid #e4e4e7',
        borderRadius: '12px',
        padding: '16px 20px',
        marginBottom: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: '#09090b', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={18} />
          </div>
          <div>
            <div style={{ fontSize: '0.92rem', fontWeight: '800', color: '#09090b' }}>
              Curated Reaction GIF Library ({predefinedList.length} Memes Ready)
            </div>
            <div style={{ fontSize: '0.76rem', color: '#71717a', marginTop: '2px' }}>
              Pre-configured with viral memes (Chloe side eye, Travolta, Popcat, Risitas, Mind blown) with full keyword tagging for instant 50% chat attachments.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setGalleryView(galleryView === 'predefined' ? 'vault' : 'predefined')}
            className="btn"
            style={{ fontSize: '0.8rem', padding: '7px 14px' }}
          >
            <span>{galleryView === 'predefined' ? '← Back to My Vault' : 'Browse Predefined List'}</span>
          </button>
          <button
            onClick={() => handleImportPredefined()}
            disabled={importingPredefined}
            className="btn btn-primary"
            style={{ fontSize: '0.8rem', padding: '7px 16px' }}
          >
            {importingPredefined ? (
              <>
                <RefreshCw size={13} className="animate-spin" />
                <span>Importing All...</span>
              </>
            ) : (
              <>
                <Download size={13} />
                <span>Import All to My Vault</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* CATEGORY FILTER PILLS */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
            FILTER BY EMOTION CATEGORY
          </span>
          <span style={{ fontSize: '0.75rem', color: '#71717a' }}>
            Total Items: {items.length}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '6px' }}>
          <button
            onClick={() => setActiveCategory('all')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '20px',
              border: '1px solid',
              borderColor: activeCategory === 'all' ? '#09090b' : '#e4e4e7',
              background: activeCategory === 'all' ? '#09090b' : '#ffffff',
              color: activeCategory === 'all' ? '#ffffff' : '#09090b',
              fontSize: '0.78rem',
              fontWeight: '700',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            <span>All Categories</span>
          </button>

          {categories.map(cat => {
            const isSelected = activeCategory === cat.id;
            return (
              <div
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '20px',
                  border: '1px solid',
                  borderColor: isSelected ? '#09090b' : '#e4e4e7',
                  background: isSelected ? '#09090b' : '#ffffff',
                  color: isSelected ? '#ffffff' : '#09090b',
                  fontSize: '0.78rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {getCategoryIcon(cat.id)}
                <span>{cat.label || cat.id}</span>

                {/* Edit / Rename Button for custom categories */}
                {cat.isCustom && (
                  <button
                    onClick={(e) => openRenameModal(cat, e)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: isSelected ? '#ffffff' : '#71717a',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      marginLeft: '4px'
                    }}
                    title="Rename category"
                  >
                    <Pencil size={11} />
                  </button>
                )}

                {/* Delete Button for custom categories */}
                {cat.isCustom && (
                  <button
                    onClick={(e) => handleDeleteCustomCategory(cat.id, e)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: isSelected ? '#ffffff' : '#71717a',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      marginLeft: '2px'
                    }}
                    title="Delete category"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* GALLERY VIEW TOGGLE & FILTER BAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', background: '#f4f4f5', borderRadius: '8px', padding: '3px' }}>
          <button
            type="button"
            onClick={() => setGalleryView('vault')}
            style={{
              background: galleryView === 'vault' ? '#ffffff' : 'transparent',
              color: galleryView === 'vault' ? '#09090b' : '#71717a',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: '700',
              cursor: 'pointer',
              boxShadow: galleryView === 'vault' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
            }}
          >
            My Active Vault ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setGalleryView('predefined')}
            style={{
              background: galleryView === 'predefined' ? '#ffffff' : 'transparent',
              color: galleryView === 'predefined' ? '#09090b' : '#71717a',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: '700',
              cursor: 'pointer',
              boxShadow: galleryView === 'predefined' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
            }}
          >
            Curated Predefined GIFs ({predefinedList.length})
          </button>
        </div>

        {galleryView === 'predefined' && (
          <button
            onClick={() => handleImportPredefined()}
            disabled={importingPredefined}
            className="btn btn-primary"
            style={{ fontSize: '0.78rem', padding: '6px 14px' }}
          >
            <Download size={13} />
            <span>Import All Curated into My Vault</span>
          </button>
        )}
      </div>

      {/* GALLERY GRID */}
      {galleryView === 'predefined' ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '14px'
        }}>
          {(activeCategory === 'all' ? predefinedList : predefinedList.filter(p => p.category === activeCategory)).map(pred => {
            const alreadyInVault = items.some(i => i.url === pred.url);
            return (
              <div
                key={pred.id}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e4e4e7',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <div style={{ height: '170px', background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                  <img
                    src={pred.url}
                    alt={pred.name}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    loading="lazy"
                  />
                  <span
                    style={{
                      position: 'absolute',
                      top: '8px',
                      left: '8px',
                      background: 'rgba(9, 9, 11, 0.85)',
                      color: '#ffffff',
                      fontSize: '0.62rem',
                      fontWeight: '700',
                      padding: '2px 7px',
                      borderRadius: '4px',
                      textTransform: 'uppercase',
                      fontFamily: "'JetBrains Mono', monospace"
                    }}
                  >
                    {pred.category}
                  </span>
                  <span
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      background: '#ffffff',
                      color: '#09090b',
                      fontSize: '0.62rem',
                      fontWeight: '700',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      border: '1px solid #e4e4e7'
                    }}
                  >
                    PREDEFINED
                  </span>
                </div>

                <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '0.86rem', color: '#09090b', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {pred.name}
                    </div>

                    {pred.keywords && pred.keywords.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
                        {pred.keywords.map(kw => (
                          <span
                            key={kw}
                            style={{
                              fontSize: '0.66rem',
                              background: '#f4f4f5',
                              color: '#09090b',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontWeight: '600'
                            }}
                          >
                            #{kw}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #f4f4f5' }}>
                    <a
                      href={pred.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#71717a', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                    >
                      <ExternalLink size={12} />
                      <span>Preview</span>
                    </a>

                    {alreadyInVault ? (
                      <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <CheckCircle2 size={13} />
                        <span>In My Vault</span>
                      </span>
                    ) : (
                      <button
                        onClick={() => handleImportPredefined([pred.id])}
                        disabled={importingPredefined}
                        className="btn btn-primary"
                        style={{ fontSize: '0.72rem', padding: '4px 10px' }}
                      >
                        <Plus size={12} />
                        <span>Add to Vault</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : loading ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#71717a' }}>
          <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px auto' }} />
          <div>Loading reaction vault media...</div>
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', background: '#fafafa', borderRadius: '12px', border: '1px dashed #e4e4e7' }}>
          <ImageIcon size={36} style={{ color: '#a1a1aa', margin: '0 auto 12px auto' }} />
          <h4 style={{ fontSize: '1rem', fontWeight: '700', color: '#09090b', margin: 0 }}>
            No uploads in [{activeCategory}] yet
          </h4>
          <p style={{ fontSize: '0.82rem', color: '#71717a', marginTop: '6px', maxWidth: '480px', margin: '6px auto 16px auto' }}>
            Whenever this category is triggered in chats, the AI will use our curated smart GIF fallback until you upload your own images or GIFs above.
          </p>
          <button
            onClick={() => {
              if (activeCategory !== 'all') setSelectedCategory(activeCategory);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="btn btn-primary"
            style={{ fontSize: '0.8rem' }}
          >
            <Upload size={14} />
            <span>Upload Media for [{activeCategory}]</span>
          </button>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '14px'
        }}>
          {items.map(item => (
            <div
              key={item._id}
              style={{
                background: '#ffffff',
                border: '1px solid #e4e4e7',
                borderRadius: '10px',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease'
              }}
            >
              {/* Thumbnail Container */}
              <div style={{ height: '170px', background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                <img
                  src={item.url}
                  alt={item.name}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  loading="lazy"
                />
                <span
                  style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    background: 'rgba(9, 9, 11, 0.85)',
                    color: '#ffffff',
                    fontSize: '0.62rem',
                    fontWeight: '700',
                    padding: '2px 7px',
                    borderRadius: '4px',
                    textTransform: 'uppercase',
                    fontFamily: "'JetBrains Mono', monospace"
                  }}
                >
                  {item.category}
                </span>

                <span
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    background: '#ffffff',
                    color: '#09090b',
                    fontSize: '0.62rem',
                    fontWeight: '700',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    border: '1px solid #e4e4e7'
                  }}
                >
                  {item.mediaType?.toUpperCase() || 'GIF'}
                </span>
              </div>

              {/* Card Meta & Actions */}
              <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: '700', fontSize: '0.86rem', color: '#09090b', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#71717a', marginTop: '2px', fontFamily: "'JetBrains Mono', monospace" }}>
                    Added {new Date(item.createdAt).toLocaleDateString()}
                  </div>

                  {/* Keywords tags */}
                  {item.keywords && item.keywords.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
                      {item.keywords.map(kw => (
                        <span
                          key={kw}
                          style={{
                            fontSize: '0.66rem',
                            background: '#f4f4f5',
                            color: '#09090b',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontWeight: '600'
                          }}
                        >
                          #{kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #f4f4f5' }}>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#71717a', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                  >
                    <ExternalLink size={12} />
                    <span>View Full</span>
                  </a>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={() => openEditModal(item)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#09090b',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                        fontSize: '0.72rem',
                        fontWeight: '600'
                      }}
                      title="Edit title & keywords"
                    >
                      <Pencil size={12} />
                      <span>Edit</span>
                    </button>

                    <button
                      onClick={() => handleDeleteMedia(item._id, item.name)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                        fontSize: '0.72rem',
                        fontWeight: '600'
                      }}
                      title="Delete media"
                    >
                      <Trash2 size={12} />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* EDIT MEDIA MODAL */}
      {editingItem && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '480px',
            width: '100%',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '800', margin: 0, color: '#09090b' }}>
                Edit Media & Keywords
              </h3>
              <button
                onClick={() => setEditingItem(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#71717a' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEditItem}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '700', textTransform: 'uppercase', color: '#71717a', marginBottom: '6px' }}>
                  Media Label / Title
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  style={{ height: '38px' }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '700', textTransform: 'uppercase', color: '#71717a', marginBottom: '6px' }}>
                  Category
                </label>
                <select
                  value={editForm.category}
                  onChange={e => setEditForm({ ...editForm, category: e.target.value })}
                  style={{ height: '38px', fontWeight: '600' }}
                >
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label || cat.id}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '700', textTransform: 'uppercase', color: '#71717a', marginBottom: '6px' }}>
                  Keywords / Humour Triggers (Comma separated)
                </label>
                <input
                  type="text"
                  value={editForm.keywords}
                  onChange={e => setEditForm({ ...editForm, keywords: e.target.value })}
                  placeholder="e.g. sus, judging, ai, bombastic, dog"
                  style={{ height: '38px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="btn"
                  style={{ fontSize: '0.8rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="btn btn-primary"
                  style={{ fontSize: '0.8rem' }}
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE NEW CATEGORY MODAL */}
      {showNewCategoryModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '440px',
            width: '100%',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '800', margin: 0, color: '#09090b' }}>
                Add Custom Category
              </h3>
              <button
                onClick={() => setShowNewCategoryModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#71717a' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.82rem', color: '#71717a', marginBottom: '16px' }}>
              Create a custom emotion or reaction category (e.g. <code>savage</code>, <code>flirty</code>, <code>gaming</code>, <code>food</code>). Your AI will understand this tag and attach your media when appropriate.
            </p>

            <form onSubmit={handleCreateCategory}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '700', textTransform: 'uppercase', color: '#71717a', marginBottom: '6px' }}>
                  Category Tag / Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. savage, flirty, food"
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  autoFocus
                  style={{ height: '40px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowNewCategoryModal(false)}
                  className="btn"
                  style={{ fontSize: '0.8rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingCategory || !newCategoryName.trim()}
                  className="btn btn-primary"
                  style={{ fontSize: '0.8rem' }}
                >
                  {creatingCategory ? 'Creating...' : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RENAME CATEGORY MODAL */}
      {renameModalCategory && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '440px',
            width: '100%',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '800', margin: 0, color: '#09090b' }}>
                Rename Category &quot;{renameModalCategory.id}&quot;
              </h3>
              <button
                onClick={() => setRenameModalCategory(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#71717a' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.82rem', color: '#71717a', marginBottom: '16px' }}>
              Renaming will automatically update all media items currently in this category to the new name.
            </p>

            <form onSubmit={handleRenameCategorySubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '700', textTransform: 'uppercase', color: '#71717a', marginBottom: '6px' }}>
                  New Category Name
                </label>
                <input
                  type="text"
                  value={renameTargetName}
                  onChange={e => setRenameTargetName(e.target.value)}
                  autoFocus
                  style={{ height: '40px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setRenameModalCategory(null)}
                  className="btn"
                  style={{ fontSize: '0.8rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={renamingCategory || !renameTargetName.trim()}
                  className="btn btn-primary"
                  style={{ fontSize: '0.8rem' }}
                >
                  {renamingCategory ? 'Saving...' : 'Rename Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
