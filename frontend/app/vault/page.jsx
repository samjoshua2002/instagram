'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import {
  Image as ImageIcon, Upload, Plus, Trash2, CheckCircle2,
  AlertCircle, RefreshCw, Link as LinkIcon, Film, Sparkles,
  Smile, Flame, Eye, Heart, HelpCircle, Frown, X, ExternalLink
} from 'lucide-react';

export default function MediaVaultPage() {
  const { API_BASE, showToast } = useApp();

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Upload Form State
  const [uploadMode, setUploadMode] = useState('file'); // 'file' | 'url'
  const [selectedCategory, setSelectedCategory] = useState('joy');
  const [mediaName, setMediaName] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState('');

  // New Category State
  const [showNewCategoryModal, setShowNewCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchVaultData();
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
            mediaType: mediaUrl.toLowerCase().includes('.gif') ? 'gif' : 'image',
          }),
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Added to [${selectedCategory}]!`, 'success');
          setMediaUrl('');
          setMediaName('');
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

  const handleDeleteCustomCategory = async (catName, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete custom category "${catName}"? Existing uploads in this category will remain.`)) return;

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
              REACTION VAULT & EMOTION ATTACHMENTS
            </span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#09090b', letterSpacing: '-0.03em', margin: 0 }}>
            Media & Reaction Vault
          </h1>
          <p style={{ fontSize: '0.86rem', color: '#71717a', marginTop: '4px', maxWidth: '680px' }}>
            Upload your own images and GIFs across emotional categories (Joy, LOL, Wonder, Sad, Happy, etc.) so your AI sends authentic visual reactions during Instagram direct messages.
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
              Add Media to Vault
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
              Paste Direct GIF/Image URL
            </button>
          </div>
        </div>

        <form onSubmit={handleUploadSubmit}>
          <div className="responsive-form-grid" style={{ marginBottom: '16px' }}>
            {/* Category Select */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', color: '#71717a', marginBottom: '6px' }}>
                Emotional Category
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
                Media Title / Label (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Laughing Wheeze GIF, Epic Facepalm"
                value={mediaName}
                onChange={e => setMediaName(e.target.value)}
                style={{ height: '40px' }}
              />
            </div>
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
                {cat.isCustom && (
                  <button
                    onClick={(e) => handleDeleteCustomCategory(cat.id, e)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: isSelected ? '#a1a1aa' : '#71717a',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      marginLeft: '4px'
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

      {/* GALLERY GRID */}
      {loading ? (
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
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
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
                      gap: '4px',
                      fontSize: '0.72rem',
                      fontWeight: '600'
                    }}
                    title="Delete media"
                  >
                    <Trash2 size={13} />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
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

    </div>
  );
}
