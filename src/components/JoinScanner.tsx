import React,{useState} from 'react';
import {Alert,Text,View} from 'react-native';
import {CameraView,useCameraPermissions} from 'expo-camera';
import {ActionButton} from './UI';
import {colors as c} from './theme';
export function JoinScanner({onScanned,onClose}:{onScanned:(id:string,code:string)=>void;onClose:()=>void}) {
 const [permission,ask]=useCameraPermissions();const [scanned,setScanned]=useState(false);
 if(!permission)return <Text style={{color:c.muted}}>Checking camera permission…</Text>;
 if(!permission.granted)return <View><Text style={{color:c.muted,marginBottom:10}}>Allow camera access to scan a bus joining QR code.</Text><ActionButton title="Allow camera" onPress={()=>{void ask();}}/>
 <ActionButton variant="secondary" title="Enter code manually" onPress={onClose}/></View>;
 return <View><View style={{height:320,borderRadius:15,overflow:'hidden'}}>
 <CameraView style={{flex:1}} facing="back" barcodeScannerSettings={{barcodeTypes:['qr']}} onBarcodeScanned={scanned?undefined:({data})=>{
  setScanned(true);const parts=data.split('|');
  if(parts.length===3&&parts[0]==='SVS1'&&parts[1].length>8&&parts[2].length>=10){onScanned(parts[1],parts[2]);}
  else {Alert.alert('Not a bus joining QR code','Scan the code supplied by the vehicle owner.');setScanned(false);}
 }}/></View><ActionButton title="Cancel scanning" variant="secondary" onPress={onClose}/></View>;
}
