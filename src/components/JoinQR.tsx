import React from 'react';
import {View,Text} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import {colors as c} from './theme';
export function JoinQR({vehicleId,code}:{vehicleId:string;code:string}) {
  return <View style={{alignItems:'center',marginVertical:15,padding:18,backgroundColor:'white',borderRadius:16,borderWidth:1,borderColor:c.border}}>
    <QRCode value={`SVS1|${vehicleId}|${code}`} size={174} backgroundColor="#FFFFFF" color="#13283E" quietZone={8}/>
    <Text style={{fontSize:12,color:c.muted,textAlign:'center',marginTop:12}}>Passenger scans this code to prepare a joining request. Owner approval is still required.</Text>
  </View>;
}
