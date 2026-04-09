import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, ScrollView, Platform, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import Card from '@/components/ui/card';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { API_BASE, get, post } from '@/services/apiClient';
import Svg, { Polygon, Text as SvgText } from 'react-native-svg';

type TryOnService = {
  serviceId: string;
  name: string;
  description?: string;
  price?: number;
  durationMinutes?: number;
  imageUrl?: string | null;
};

type OverlayPlan = {
  overlays?: Array<{
    finger?: string;
    confidence?: number;
    polygon?: Array<{ x: number; y: number }>;
    style?: { colorPalette?: string[] };
  }>;
};

function pointsToSvg(points: Array<{ x: number; y: number }>, width: number, height: number) {
  return points.map((p) => `${p.x * width},${p.y * height}`).join(' ');
}

function polygonAreaNormalized(points: Array<{ x: number; y: number }>) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += (Number(a?.x || 0) * Number(b?.y || 0)) - (Number(b?.x || 0) * Number(a?.y || 0));
  }
  return Math.abs(area) / 2;
}

function getRenderableOverlays(overlayPlan: OverlayPlan | null) {
  const overlays = Array.isArray(overlayPlan?.overlays) ? overlayPlan!.overlays! : [];
  return overlays.filter((ov) => {
    const polygon = Array.isArray(ov?.polygon) ? ov.polygon : [];
    if (polygon.length < 3) return false;

    const area = polygonAreaNormalized(polygon);
    // Keep only realistic nail areas to avoid floating boxes from low-quality detection.
    if (!(area >= 0.0012 && area <= 0.08)) return false;

    const xs = polygon.map((p) => Number(p?.x || 0));
    const ys = polygon.map((p) => Number(p?.y || 0));
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    const ratio = Math.max(w, h) / Math.max(1e-6, Math.min(w, h));
    // Nail boxes are typically elongated; near-square boxes are often bad detections.
    if (ratio < 1.12) return false;

    const confidence = Number(ov?.confidence ?? 0);
    if (Number.isFinite(confidence) && confidence < 0.5) return false;

    return true;
  });
}

function absoluteAssetUrl(rawUrl?: string | null) {
  const url = String(rawUrl || '').trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;

  const base = String(API_BASE || '').replace(/\/api\/?$/i, '');
  if (!base) return url;
  if (url.startsWith('/')) return `${base}${url}`;
  return `${base}/${url}`;
}

function derivePaletteFromService(service: TryOnService | null) {
  const n = String(service?.name || '').toLowerCase();
  if (/french|classic/.test(n)) return ['#FDE68A', '#FFFFFF'];
  if (/ombre|pink/.test(n)) return ['#FBCFE8', '#FEE2E2'];
  if (/glitter|gold|chrome/.test(n)) return ['#FDE68A', '#FCD34D'];
  if (/blue/.test(n)) return ['#BFDBFE', '#C7F9FF'];
  if (/nude|matte/.test(n)) return ['#FCD5A9', '#F3E8FF'];
  if (/red/.test(n)) return ['#FCA5A5', '#FB7185'];
  return ['#EC4899', '#FDBA74'];
}

export default function AITryOn() {
  const SHOW_REALTIME_OVERLAY = false;
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageDataUrl, setSelectedImageDataUrl] = useState<string | null>(null);
  const [templateImage, setTemplateImage] = useState<string | null>(null);
  const [templateImageDataUrl, setTemplateImageDataUrl] = useState<string | null>(null);
  const [templateImageUrl, setTemplateImageUrl] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [services, setServices] = useState<TryOnService[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [overlayPlan, setOverlayPlan] = useState<OverlayPlan | null>(null);
  const [lastAnalysis, setLastAnalysis] = useState<any | null>(null);
  const [analysisWarnings, setAnalysisWarnings] = useState<string[]>([]);
  const [generationWarnings, setGenerationWarnings] = useState<string[]>([]);
  const [stageWidth, setStageWidth] = useState(0);
  const [history, setHistory] = useState<any[]>([]);
  const STORAGE_KEY = '@MyNailApp:aitryon_history_v1';
  const previewReqIdRef = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          setHistory(JSON.parse(raw));
        }
      } catch  {
        // ignore load error
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(history));
      } catch  {
        // ignore save error
      }
    })();
  }, [history]);

  const selectedService = useMemo(
    () => services.find((x) => String(x.serviceId) === String(selectedServiceId || '')) || null,
    [services, selectedServiceId],
  );

  const renderableOverlays = useMemo(() => getRenderableOverlays(overlayPlan), [overlayPlan]);

  useEffect(() => {
    (async () => {
      setServicesLoading(true);
      try {
        const res = await get('/customer/ai-tryon/services?limit=36');
        const list = Array.isArray(res?.data) ? res.data : [];
        setServices(list);
      } catch {
        setServices([]);
      } finally {
        setServicesLoading(false);
      }
    })();
  }, []);

  function buildDesignPayload() {
    if (!selectedService) return null;
    return {
      id: selectedService.serviceId,
      name: selectedService.name,
      colorPalette: derivePaletteFromService(selectedService),
      finish: /matte/i.test(String(selectedService.name || '')) ? 'matte' : 'glossy',
      opacity: 0.92,
    };
  }

  async function analyzeImage(imageDataUrl: string) {
    setIsAnalyzing(true);
    setAnalysisWarnings([]);

    try {
      const res = await post('/customer/ai-tryon/analyze', {
        imageDataUrl,
        handHint: 'mobile-app realtime try-on',
      });

      const warnings = Array.isArray(res?.data?.analysis?.qualityWarnings)
        ? res.data.analysis.qualityWarnings.map((x: any) => String(x || '').trim()).filter(Boolean)
        : [];
      setLastAnalysis(res?.data?.analysis || null);
      setAnalysisWarnings(warnings);
    } catch (err: any) {
      Alert.alert('Lỗi', String(err?.message || 'Không phân tích được ảnh tay/móng'));
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function previewDesign(imageDataUrl: string, designPayload: any) {
    const reqId = ++previewReqIdRef.current;
    setIsPreviewing(true);

    try {
      const res = await post('/customer/ai-tryon/preview', {
        imageDataUrl,
        handHint: 'mobile-app realtime preview',
        design: designPayload,
      });

      if (reqId !== previewReqIdRef.current) return;
      setOverlayPlan(res?.data?.overlayPlan || null);
    } catch (err: any) {
      if (reqId !== previewReqIdRef.current) return;
      setOverlayPlan(null);
      Alert.alert('Lỗi', String(err?.message || 'Không render được overlay realtime'));
    } finally {
      if (reqId === previewReqIdRef.current) {
        setIsPreviewing(false);
      }
    }
  }

  async function pickTemplateImage() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Quyền bị từ chối', 'Cần quyền truy cập thư viện để chọn mẫu móng');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, base64: true });
      if (result.canceled) return;

      const asset = result.assets?.[0];
      if (!asset?.uri || !asset?.base64) return;

      const mime = asset.mimeType || 'image/jpeg';
      setTemplateImage(asset.uri);
      setTemplateImageDataUrl(`data:${mime};base64,${asset.base64}`);
      setTemplateImageUrl(null);
      setProcessedImage(null);
      setGenerationWarnings([]);
    } catch {
      Alert.alert('Lỗi', 'Không thể tải ảnh mẫu móng');
    }
  }

  function useServiceImageAsTemplate(service: TryOnService) {
    if (!service?.imageUrl) {
      Alert.alert('Thiếu ảnh', 'Dịch vụ này chưa có ảnh để dùng làm mẫu tham chiếu');
      return;
    }

    setTemplateImage(absoluteAssetUrl(service.imageUrl));
    setTemplateImageDataUrl(null);
    setTemplateImageUrl(String(service.imageUrl));
    setProcessedImage(null);
    setGenerationWarnings([]);
  }

  useEffect(() => {
    if (!selectedImageDataUrl || !selectedService) {
      setOverlayPlan(null);
      return;
    }

    const payload = buildDesignPayload();
    if (!payload) return;

    const timer = setTimeout(() => {
      previewDesign(selectedImageDataUrl, payload);
    }, 300);

    return () => clearTimeout(timer);
  }, [selectedImageDataUrl, selectedService]);

  async function pickImage(fromCamera = false) {
    try {
      // request permissions
      if (fromCamera) {
        // Warn when running in iOS Simulator, but do not return — allow permission flow to proceed.
        if (Platform.OS === 'ios' && !Constants.isDevice) {
          if (__DEV__) {
            Alert.alert('Thông tin thiết bị (debug)', `Platform=${Platform.OS}\nisDevice=${Constants.isDevice}`);
          }
        }
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Quyền bị từ chối',
            'Cần quyền camera để chụp ảnh',
            [
              { text: 'Hủy', style: 'cancel' },
              { text: 'Mở Cài đặt', onPress: () => Linking.openSettings?.() },
            ],
          );
          return;
        }
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Quyền bị từ chối',
            'Cần quyền truy cập thư viện ảnh',
            [
              { text: 'Hủy', style: 'cancel' },
              { text: 'Mở Cài đặt', onPress: () => Linking.openSettings?.() },
            ],
          );
          return;
        }
      }

      let result: ImagePicker.ImagePickerResult;
      if (fromCamera) {
        result = await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, base64: true });
      }

      // Use the modern `canceled` flag and the `assets` array for the picked image.
      if (!result.canceled) {
        const asset = result.assets?.[0];
        const uri = asset?.uri;
        const base64 = asset?.base64;
        if (uri && base64) {
          const mime = asset?.mimeType || 'image/jpeg';
          const imageDataUrl = `data:${mime};base64,${base64}`;

          setSelectedImage(uri);
          setSelectedImageDataUrl(imageDataUrl);
          setProcessedImage(null);
          setOverlayPlan(null);
          setLastAnalysis(null);
          setSelectedServiceId(null);
          setTemplateImage(null);
          setTemplateImageDataUrl(null);
          setTemplateImageUrl(null);
          setGenerationWarnings([]);

          analyzeImage(imageDataUrl);
        }
      }
    } catch  {
      Alert.alert('Lỗi', 'Không thể chọn ảnh');
    }
  }

  async function handleTryOn() {
    if (!selectedImageDataUrl || (!selectedService && !templateImageDataUrl && !templateImageUrl)) {
      Alert.alert('Thiếu thông tin', 'Vui lòng chọn dịch vụ hoặc tải ảnh mẫu móng trước khi thử mẫu');
      return;
    }

    setIsProcessing(true);
    setGenerationWarnings([]);

    try {
      const design = buildDesignPayload();
      const res = await post('/customer/ai-tryon/generate', {
        imageDataUrl: selectedImageDataUrl,
        handHint: 'mobile-app generate final try-on',
        design,
        selectedService,
        templateImageDataUrl,
        templateImageUrl,
        analysis: lastAnalysis,
        overlayPlan,
        userPrompt: `Generate realistic ${selectedService?.name || 'nail art'} try-on from selected service/template`,
      });

      const generatedDataUrl = res?.data?.generation?.generatedImageDataUrl || null;
      const newWarnings = Array.isArray(res?.data?.generation?.warnings)
        ? res.data.generation.warnings.map((x: any) => String(x || '').trim()).filter(Boolean)
        : [];

      setGenerationWarnings(newWarnings);
      setOverlayPlan(res?.data?.overlayPlan || overlayPlan);
      setProcessedImage(generatedDataUrl || selectedImage);

      const item = {
        id: Date.now(),
        date: new Date().toISOString(),
        design: selectedService?.name || 'Custom template',
        original: selectedImage,
        result: generatedDataUrl || selectedImage,
      };
      setHistory((h) => [item, ...h]);
    } catch (err: any) {
      Alert.alert('Lỗi', String(err?.message || 'Không generate được bộ móng mới'));
    } finally {
      setIsProcessing(false);
    }
  }

  function handleSaveAndSchedule() {
    Alert.alert('Lưu', 'Kết quả đã được lưu và có thể dùng để tạo lịch hẹn.');
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ padding: 12 }}>
      <View style={styles.header}>
        <View style={styles.logoCircle}><Feather name="star" size={20} color="#fff" /></View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.title}>AI Try-On Nail</Text>
          <Text style={styles.subtitle}>Thử mẫu nail bằng AI</Text>
        </View>
      </View>

      {!selectedImage ? (
        <View style={{ gap: 12 }}>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => pickImage(true)}>
            <Feather name="camera" size={20} color="#fff" />
            <Text style={styles.primaryBtnText}>Chụp ảnh tay khách</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={() => pickImage(false)}>
            <Feather name="upload" size={18} color="#6b7280" />
            <Text style={styles.secondaryBtnText}>Tải ảnh từ thư viện</Text>
          </TouchableOpacity>

          {/* Removed temporary Test UI picker per request */}

          <TouchableOpacity style={styles.linkBtn} onPress={() => Alert.alert('Lịch sử', `Bạn đã có ${history.length} lần thử mẫu được lưu.`)}>
            <Feather name="clock" size={16} color="#374151" />
            <Text style={styles.linkBtnText}>Xem lịch sử thử mẫu</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Card>
            <View style={{ marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontWeight: '700' }}>Ảnh gốc</Text>
              <TouchableOpacity onPress={() => { setSelectedImage(null); setSelectedImageDataUrl(null); setProcessedImage(null); setSelectedServiceId(null); setTemplateImage(null); setTemplateImageDataUrl(null); setTemplateImageUrl(null); setOverlayPlan(null); setLastAnalysis(null); setAnalysisWarnings([]); setGenerationWarnings([]); }}>
                <Text style={{ color: '#ef4444' }}>Chọn lại</Text>
              </TouchableOpacity>
            </View>
            <View
              style={{ width: '100%', height: 300, borderRadius: 12, overflow: 'hidden' }}
              onLayout={(e) => setStageWidth(e.nativeEvent.layout.width)}
            >
              <Image source={{ uri: selectedImage }} style={{ width: '100%', height: '100%' }} />

              {SHOW_REALTIME_OVERLAY && renderableOverlays.length ? (
                <Svg width={stageWidth} height={300} style={StyleSheet.absoluteFillObject}>
                  {renderableOverlays.map((ov, idx) => {
                    const polygon = Array.isArray(ov?.polygon) ? ov.polygon : [];
                    if (polygon.length < 3) return null;

                    const fill = ov?.style?.colorPalette?.[0] || '#ec4899';
                    return (
                      <React.Fragment key={`ov-${idx}`}>
                        <Polygon
                          points={pointsToSvg(polygon, stageWidth, 300)}
                          fill={fill}
                          fillOpacity={0.55}
                          stroke="#ffffff"
                          strokeOpacity={0.8}
                          strokeWidth={1.2}
                        />
                        <SvgText
                          x={polygon[0].x * stageWidth}
                          y={polygon[0].y * 300 - 4}
                          fill="#ffffff"
                          fontSize="9"
                        >
                          {String(ov?.finger || '')}
                        </SvgText>
                      </React.Fragment>
                    );
                  })}
                </Svg>
              ) : null}

              {(isAnalyzing || isPreviewing) ? (
                <View style={styles.busyOverlay}>
                  <Text style={styles.busyText}>{isAnalyzing ? 'Đang nhận diện tay + móng...' : 'Đang mapping nail design realtime...'}</Text>
                </View>
              ) : null}
            </View>

            {analysisWarnings.length > 0 ? (
              <View style={{ marginTop: 8 }}>
                {analysisWarnings.map((w, i) => (
                  <Text key={`aw-${i}`} style={styles.warnText}>- {w}</Text>
                ))}
              </View>
            ) : null}
          </Card>

          <Card>
            <Text style={{ fontWeight: '700', marginBottom: 8 }}>Chọn dịch vụ thực tế (database)</Text>
            <Text style={{ color: '#6b7280', marginBottom: 8 }}>Chạm ảnh dịch vụ để dùng luôn làm mẫu tham chiếu</Text>

            {servicesLoading ? (
              <Text style={{ color: '#6b7280' }}>Đang tải dịch vụ...</Text>
            ) : (
              <View style={styles.designGrid}>
                {services.map((s) => {
                  const active = String(selectedServiceId || '') === String(s.serviceId);
                  return (
                    <TouchableOpacity
                      key={String(s.serviceId)}
                      onPress={() => setSelectedServiceId(String(s.serviceId))}
                      style={[styles.designCard, active && styles.designSelected]}
                    >
                      {s.imageUrl ? (
                        <TouchableOpacity onPress={() => useServiceImageAsTemplate(s)} style={{ width: '100%' }}>
                          <Image source={{ uri: absoluteAssetUrl(s.imageUrl) }} style={styles.designImage} />
                        </TouchableOpacity>
                      ) : (
                        <View style={[styles.designPreview, { backgroundColor: derivePaletteFromService(s)[0] }]} />
                      )}
                      <Text style={styles.designName}>{s.name}</Text>
                      <Text style={styles.designMeta}>{Number(s.price || 0).toLocaleString('vi-VN')}đ</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <View style={{ marginTop: 12 }}>
              <Text style={{ fontWeight: '700', marginBottom: 8 }}>Hoặc tải ảnh mẫu móng từ thư viện</Text>
              <TouchableOpacity style={styles.secondaryBtn} onPress={pickTemplateImage}>
                <Feather name="image" size={18} color="#6b7280" />
                <Text style={styles.secondaryBtnText}>Tải ảnh mẫu móng</Text>
              </TouchableOpacity>

              {templateImage ? (
                <View style={{ marginTop: 8 }}>
                  <Image source={{ uri: templateImage }} style={{ width: '100%', height: 120, borderRadius: 10 }} />
                </View>
              ) : null}
            </View>
          </Card>

          {!processedImage && (
            <TouchableOpacity disabled={(!selectedService && !templateImageDataUrl && !templateImageUrl) || isProcessing || isPreviewing} onPress={handleTryOn} style={[styles.primaryBtn, ((!selectedService && !templateImageDataUrl && !templateImageUrl) || isProcessing || isPreviewing) && { opacity: 0.6 }]}>
              {isProcessing ? <Text style={styles.primaryBtnText}>Đang xử lý...</Text> : <Text style={styles.primaryBtnText}>Thử mẫu ngay</Text>}
            </TouchableOpacity>
          )}

          {processedImage && (
            <Card>
              <Text style={{ fontWeight: '700', marginBottom: 8 }}>Kết quả AI</Text>
              <View style={{ width: '100%', height: 300, borderRadius: 12, overflow: 'hidden' }}>
                <Image source={{ uri: processedImage }} style={{ width: '100%', height: '100%' }} />
              </View>
              {generationWarnings.length > 0 ? (
                <View style={{ marginTop: 8 }}>
                  {generationWarnings.map((w, i) => (
                    <Text key={`gw-${i}`} style={styles.warnText}>- {w}</Text>
                  ))}
                </View>
              ) : null}
              <View style={{ marginTop: 12 }}>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSaveAndSchedule}><Text style={{ color: '#fff', fontWeight: '700' }}>Lưu & Tạo lịch hẹn</Text></TouchableOpacity>
                <TouchableOpacity style={styles.ghostBtn} onPress={() => setProcessedImage(null)}><Text>Thử mẫu khác</Text></TouchableOpacity>
              </View>
            </Card>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  logoCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#a78bfa', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800' },
  subtitle: { color: '#6b7280' },
  primaryBtn: { backgroundColor: '#8b5cf6', paddingVertical: 14, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  primaryBtnText: { color: '#fff', fontWeight: '800', marginLeft: 8 },
  secondaryBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', paddingVertical: 14, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  secondaryBtnText: { color: '#6b7280', marginLeft: 8, fontWeight: '600' },
  linkBtn: { backgroundColor: '#fff', paddingVertical: 12, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#f3f4f6' },
  linkBtnText: { color: '#374151', marginLeft: 8, fontWeight: '600' },
  designGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  designCard: { width: '31%', borderRadius: 12, padding: 6, alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: '#f3f4f6' },
  designSelected: { borderColor: '#7c3aed', elevation: 2 },
  designPreview: { width: '100%', aspectRatio: 1, borderRadius: 8, marginBottom: 6 },
  designImage: { width: '100%', aspectRatio: 1, borderRadius: 8, marginBottom: 6 },
  designName: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  designMeta: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  saveBtn: { backgroundColor: '#10b981', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  ghostBtn: { marginTop: 8, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: '#f3f4f6' },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.36)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  busyText: { color: '#fff', fontWeight: '700', paddingHorizontal: 12, textAlign: 'center' },
  warnText: { color: '#b45309', marginTop: 2, fontSize: 12 },
});