import React,{useEffect,useRef,useState} from 'react';
import {Alert,Linking,Text,View} from 'react-native';
import WebView from 'react-native-webview';
import {ActionButton,Card,Heading,Info,SmallLabel} from '../components/UI';
import {colors as c} from '../components/theme';
import {devicePath,watchValue} from '../lib/database';
import type {HelpRequest,Incident,Vehicle,VehicleLocation} from '../lib/types';

const MAP_HTML = `
<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#map{width:100%;height:100%;margin:0;padding:0}.leaflet-control-attribution{font-size:9px}</style>
</head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
let map=null,currentMarker=null,eventMarker=null;
const valid=(lat,lon)=>Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180;
const ensureMap=(lat,lon)=>{if(!map){map=L.map('map').setView([lat,lon],15);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);}};
window.updateLocations=function(currentLat,currentLon,eventLat,eventLon,preferEvent,currentLabel,eventLabel){
 const hasCurrent=valid(currentLat,currentLon),hasEvent=valid(eventLat,eventLon);
 if(!window.L||(!hasCurrent&&!hasEvent))return;
 const center=preferEvent&&hasEvent?[eventLat,eventLon]:hasCurrent?[currentLat,currentLon]:[eventLat,eventLon];ensureMap(center[0],center[1]);
 if(hasCurrent){if(!currentMarker){currentMarker=L.marker([currentLat,currentLon]).addTo(map).bindPopup(currentLabel);}else{currentMarker.setLatLng([currentLat,currentLon]);currentMarker.setPopupContent(currentLabel);}}
 else if(currentMarker){map.removeLayer(currentMarker);currentMarker=null;}
 if(hasEvent){if(!eventMarker){eventMarker=L.circleMarker([eventLat,eventLon],{radius:9,color:'#A65F00',fillColor:'#FFF4DD',fillOpacity:1,weight:3}).addTo(map).bindPopup(eventLabel);}else{eventMarker.setLatLng([eventLat,eventLon]);eventMarker.setPopupContent(eventLabel);}}
 else if(eventMarker){map.removeLayer(eventMarker);eventMarker=null;}
 map.setView(center,map.getZoom(),{animate:false});
};
window.focusCurrent=function(){if(map&&currentMarker){map.setView(currentMarker.getLatLng(),15);currentMarker.openPopup();}};
window.focusEvent=function(){if(map&&eventMarker){map.setView(eventMarker.getLatLng(),15);eventMarker.openPopup();}};
</script></body></html>`;

const coordinatesValid=(location?:{latitude?:number;longitude?:number}|null)=>
 typeof location?.latitude==='number'&&typeof location?.longitude==='number'&&
 Math.abs(location.latitude)<=90&&Math.abs(location.longitude)<=180&&!(location.latitude===0&&location.longitude===0);
const when=(time?:number)=>time?new Date(time).toLocaleString():'Unknown time';

export function LocationScreen({vehicle,trackedEvent}:{vehicle:Vehicle;trackedEvent?:HelpRequest|Incident|null}){
 const [location,setLocation]=useState<VehicleLocation|null>(null),[error,setError]=useState(''),[clock,setClock]=useState(Date.now());
 const mapRef=useRef<WebView>(null);
 useEffect(()=>{setLocation(null);setError('');const stop=watchValue<VehicleLocation>(`${devicePath(vehicle.id)}/location`,setLocation,setError);
 const timer=setInterval(()=>setClock(Date.now()),15000);return()=>{stop();clearInterval(timer);};},[vehicle.id]);
 const eventBelongsToVehicle=!trackedEvent?.vehicleId||trackedEvent.vehicleId===vehicle.id;
 const event=eventBelongsToVehicle?trackedEvent:null;
 const isAccident=event?.type==='accident'&&!('createdBy' in event);
 const currentValid=coordinatesValid(location),eventValid=coordinatesValid(event);
 const currentLat=currentValid?location!.latitude!:null,currentLon=currentValid?location!.longitude!:null;
 const eventLat=eventValid?event!.latitude!:null,eventLon=eventValid?event!.longitude!:null;
 const latestFallback=Boolean(isAccident&&!eventValid&&currentValid);
 const currentLabel=latestFallback?'Latest vehicle location':'Current bus location';
 const eventLabel=isAccident?'Accident location':'Location when request was submitted';
 const preferEvent=Boolean(isAccident&&eventValid);
 const updateMap=()=>mapRef.current?.injectJavaScript(`window.updateLocations(${currentLat??'null'},${currentLon??'null'},${eventLat??'null'},${eventLon??'null'},${preferEvent},${JSON.stringify(currentLabel)},${JSON.stringify(eventLabel)});true;`);
 useEffect(updateMap,[currentLat,currentLon,eventLat,eventLon,preferEvent,currentLabel,eventLabel]);
 const age=typeof location?.updatedAt==='number'?clock-location.updatedAt:Infinity;
 const recent=currentValid&&age>=0&&age<300000;
 const openMap=async(lat:number,lon:number)=>{try{await Linking.openURL(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`);}catch{Alert.alert('Unable to open maps','No compatible maps or browser app is available.');}};
 const externalLat=preferEvent?eventLat:currentValid?currentLat:eventLat,externalLon=preferEvent?eventLon:currentValid?currentLon:eventLon;
 return <View><Heading title="Bus location" subtitle={`${vehicle.meta.plateNumber} · ${isAccident?'Automatic accident location':'Live Firebase GPS'}`}/>
 {error?<Info text={`Database error: ${error}`}/>:null}
 {!eventBelongsToVehicle?<Info text="Location unavailable. This event belongs to a different vehicle."/>:null}
 {currentValid?<Card><SmallLabel>{currentLabel}</SmallLabel>
 <Text style={{fontWeight:'900',color:recent?c.green:c.yellow}}>{recent?'Recent location':'Last known location · stale'}</Text>
 {latestFallback?<Text style={{color:c.yellow,fontWeight:'800',marginTop:6}}>Fallback: accident coordinates were not captured.</Text>:null}
 <Text selectable style={{fontWeight:'800',color:c.navy,marginTop:7}}>{currentLat!.toFixed(6)}, {currentLon!.toFixed(6)}</Text>
 <Text style={{color:c.muted,marginTop:5}}>Last GPS update: {when(location?.updatedAt)}</Text>
 </Card>:!isAccident?<Info text="Current bus location is unavailable. No vehicle GPS has been received; the app does not substitute your phone GPS."/>:null}
 {event&&eventValid?<Card><SmallLabel>{eventLabel}</SmallLabel>
 <Text selectable style={{fontWeight:'800',color:c.navy}}>{eventLat!.toFixed(6)}, {eventLon!.toFixed(6)}</Text>
 <Text style={{color:c.muted,marginTop:5}}>GPS snapshot time: {when(event.locationUpdatedAt)}</Text>
 <Text style={{color:c.muted,marginTop:5}}>{isAccident?'Incident':'Request'} recorded: {when(event.createdAt)}</Text></Card>:null}
 {isAccident&&!eventValid&&currentValid?<Info text="Accident location unavailable. Showing Latest vehicle location from this vehicle’s current Firebase GPS."/>:null}
 {isAccident&&!eventValid&&!currentValid?<Info text="Location unavailable. This accident has no captured coordinates and the vehicle has no valid latest GPS location."/>:null}
 {event&&!isAccident&&!eventValid?<Info text="No GPS snapshot was available when this request was submitted."/>:null}
 {currentValid||eventValid?<Card><View style={{height:370,borderRadius:15,overflow:'hidden'}}>
 <WebView ref={mapRef} source={{html:MAP_HTML}} originWhitelist={['*']} javaScriptEnabled applicationNameForUserAgent="SmartVehicleSafety/2.1" onLoadEnd={updateMap} style={{flex:1}}/>
 </View>
 {currentValid?<ActionButton title={`Center ${currentLabel.toLowerCase()}`} variant="secondary" onPress={()=>mapRef.current?.injectJavaScript('window.focusCurrent();true;')}/>:null}
 {eventValid?<ActionButton title={`Show ${eventLabel.toLowerCase()}`} variant="secondary" onPress={()=>mapRef.current?.injectJavaScript('window.focusEvent();true;')}/>:null}
 {externalLat!==null&&externalLon!==null?<ActionButton title={`Open ${preferEvent?'accident':'vehicle'} location in OpenStreetMap`} variant="secondary" onPress={()=>openMap(externalLat,externalLon)}/>:null}
 </Card>:null}
 </View>;
}
